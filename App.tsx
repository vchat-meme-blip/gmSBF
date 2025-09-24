/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, Creation } from './types';
import { generateAnimationAssets, AnimationAssets } from './services/geminiService';
import { buildCreativeInstruction, promptSuggestions } from './prompts';
import AnimationPlayer from './components/AnimationPlayer';
import LoadingOverlay from './components/LoadingOverlay';
import CreationsGallery from './components/CreationsGallery';
import ApiKeyModal from './components/ApiKeyModal';
import { UploadIcon, XCircleIcon, ImageIcon, Volume2Icon, VolumeXIcon } from './components/icons';

const SBF_PRESETS = [
    '/assets/presets/sbf1.png',
    '/assets/presets/sbf2.png',
    '/assets/presets/sbf3.png',
    '/assets/presets/sbf4.png',
    '/assets/presets/sbf5.png',
];

const resizeImage = (dataUrl: string, maxWidth: number, maxHeight: number): Promise<string> => {
  const targetSize = maxWidth; 
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      console.log(`[DEBUG] Original image dimensions: ${img.naturalWidth}x${img.naturalHeight}`);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Could not get canvas context for resizing.'));
      }

      canvas.width = targetSize;
      canvas.height = targetSize;

      const { width, height } = img;
      let sx, sy, sWidth, sHeight;

      if (width > height) {
        sWidth = height;
        sHeight = height;
        sx = (width - height) / 2;
        sy = 0;
      } else {
        sWidth = width;
        sHeight = width;
        sx = 0;
        sy = (height - width) / 2;
      }
      
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetSize, targetSize);
      
      const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      resolve(resizedDataUrl);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for resizing.'));
    };
    img.src = dataUrl;
  });
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.Capturing);
  const [previousAppState, setPreviousAppState] = useState<AppState>(AppState.Capturing);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [animationAssets, setAnimationAssets] = useState<AnimationAssets | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [storyPrompt, setStoryPrompt] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [currentCreationId, setCurrentCreationId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const isAnimationPending = useRef(false);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize and attempt to play background music
    const audio = new Audio('/assets/sounds/jet2holiday.mp3');
    audio.loop = true;
    audioRef.current = audio;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Autoplay started!
            setIsMuted(false);
        }).catch(error => {
            // Autoplay was prevented.
            console.warn("Audio autoplay was prevented:", error);
            setIsMuted(true);
        });
    }

    const storedKey = localStorage.getItem('geminiApiKey');
    if (storedKey) {
        setApiKey(storedKey);
    }

    try {
      const storedCreations = localStorage.getItem('gmSbfMemes');
      if (storedCreations) {
        setCreations(JSON.parse(storedCreations));
      }
    } catch (e) {
      console.error("Failed to load creations from localStorage", e);
    }
    
    setBackgroundIndex(Math.floor(Math.random() * SBF_PRESETS.length));

    const bgInterval = setInterval(() => {
        setBackgroundIndex(prevIndex => (prevIndex + 1) % SBF_PRESETS.length);
    }, 7000);
    
    return () => {
        clearInterval(bgInterval);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    };
  }, []);
  
  // Effect to apply mute state to audio element
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.muted = isMuted;
          if (!isMuted && audioRef.current.paused) {
            audioRef.current.play().catch(e => console.error("Could not play audio on unmute:", e));
          }
      }
  }, [isMuted]);

  const handleToggleMute = () => {
      setIsMuted(prev => !prev);
  };


  const FRAME_COUNT = 9;
  const SPRITE_SHEET_WIDTH = 1024;
  const SPRITE_SHEET_HEIGHT = 1024;

  const handleCreateAnimation = useCallback(async (isRegeneration: boolean = false) => {
    if (!apiKey) {
      isAnimationPending.current = true;
      setApiKeyError("Please provide a Gemini API key to start making memes.");
      setShowApiKeyModal(true);
      return;
    }
    
    if (!originalImage) {
        setError("Please select an image to create a meme.");
        return;
    };

    let finalPrompt = storyPrompt.trim();
    if (!finalPrompt) {
        const randomSuggestion = promptSuggestions[Math.floor(Math.random() * promptSuggestions.length)];
        finalPrompt = randomSuggestion.prompt;
        setStoryPrompt(finalPrompt);
    }

    const finalCreativeInstruction = buildCreativeInstruction(finalPrompt, originalImage, FRAME_COUNT);
    setPreviousAppState(AppState.Capturing);
    setAppState(AppState.Processing);
    setCurrentCreationId(null);
    setError(null);
    
    let base64Image: string | null = null;
    let mimeType: string | null = null;

    try {
      if (originalImage) {
        setLoadingMessage('Optimizing image...');
        const resizedImage = await resizeImage(originalImage, 1024, 1024);
        const imageParts = resizedImage.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/);
        if (!imageParts || imageParts.length !== 3) {
          throw new Error("Could not process the resized image data.");
        }
        mimeType = imageParts[1];
        base64Image = imageParts[2];
      }
      
      setLoadingMessage('Generating sprite sheet...');

      const imageGenerationPrompt = `
PRIMARY GOAL: Generate a single animated sprite sheet image.
You are an expert animator. Your task is to create a ${FRAME_COUNT}-frame animated sprite sheet.
${finalCreativeInstruction}
IMAGE OUTPUT REQUIREMENTS:
- The output MUST be a single, square image file.
- The image MUST be precisely ${SPRITE_SHEET_WIDTH}x${SPRITE_SHEET_HEIGHT} pixels.
- The image must contain ${FRAME_COUNT} animation frames arranged in a 3x3 grid (3 rows, 3 columns).
- Do not add numbers to the frames.
- DO NOT return any text or JSON. Only the image is required.`;
      
      const generatedAsset = await generateAnimationAssets(
          apiKey,
          base64Image,
          mimeType,
          imageGenerationPrompt,
          (message: string) => setLoadingMessage(message)
      );

      if (!generatedAsset || !generatedAsset.imageData.data) {
        throw new Error(`Sprite sheet generation failed. Did not receive a valid image.`);
      }

      setAnimationAssets(generatedAsset);
      setAppState(AppState.Animating);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      console.error(err);
      
      if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('quota')) {
          setApiKeyError(`There was an issue with your API key: ${errorMessage}. Please check it and try again.`);
          setShowApiKeyModal(true);
      } else {
          setError(errorMessage);
      }
      setAppState(AppState.Capturing);
    }
  }, [storyPrompt, originalImage, apiKey]);

  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('geminiApiKey', newKey);
    setShowApiKeyModal(false);
    setApiKeyError(null);

    if (isAnimationPending.current) {
        isAnimationPending.current = false;
        setTimeout(() => handleCreateAnimation(), 0);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalImage(reader.result as string);
      };
      reader.onerror = () => {
        console.error("Failed to read file");
        setError("Failed to read the selected image file.");
        setAppState(AppState.Error);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handlePresetSelect = async (imageUrl: string) => {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            setOriginalImage(reader.result as string);
        };
        reader.readAsDataURL(blob);
    } catch (error) {
        console.error("Failed to load preset image:", error);
        setError("Could not load the selected preset image.");
    }
  };

  const handleClearImage = () => {
    setOriginalImage(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };
  
  const handleBackFromPlayer = () => {
    setAppState(previousAppState);
    setAnimationAssets(null);
    setCurrentCreationId(null);
  };
  
  const handleSuggestionClick = (prompt: string) => {
    setStoryPrompt(currentPrompt => currentPrompt === prompt ? '' : prompt);
  };
  
  const handleSaveCreation = (assets: AnimationAssets, prompt: string) => {
    const newCreation: Creation = {
        id: new Date().toISOString(),
        assets,
        prompt,
    };
    const updatedCreations = [newCreation, ...creations];
    setCreations(updatedCreations);
    localStorage.setItem('gmSbfMemes', JSON.stringify(updatedCreations));
    setCurrentCreationId(newCreation.id);
  };

  const handleDeleteCreation = (id: string) => {
    const updatedCreations = creations.filter(c => c.id !== id);
    setCreations(updatedCreations);
    localStorage.setItem('gmSbfMemes', JSON.stringify(updatedCreations));
  };

  const handleViewCreation = (creation: Creation) => {
    setAnimationAssets(creation.assets);
    setStoryPrompt(creation.prompt);
    setCurrentCreationId(creation.id);
    setPreviousAppState(AppState.Gallery);
    setAppState(AppState.Animating);
  };

  const renderContent = () => {
    switch (appState) {
      case AppState.Capturing:
        return (
          <div className="flex flex-col items-center justify-center w-full max-w-xl mx-auto">
            <header className="w-full flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <img src="/assets/presets/sbf3.png" alt="gm SBF logo" className="w-16 h-16 rounded-full object-cover border-2 border-gray-400 shadow-md" />
                    <h1 className="text-6xl text-gray-800 tracking-tighter">
                        gm SBF
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleToggleMute}
                        className="bg-white/80 text-gray-700 p-2 rounded-full hover:bg-white transition-all border border-gray-300 shadow-sm"
                        aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
                    >
                        {isMuted ? <VolumeXIcon className="w-5 h-5" /> : <Volume2Icon className="w-5 h-5" />}
                    </button>
                    <button 
                        onClick={() => setAppState(AppState.Gallery)} 
                        className="bg-white/80 text-gray-700 font-bold py-2 px-4 rounded-lg hover:bg-white transition-all border border-gray-300 shadow-sm flex items-center gap-2"
                        aria-label={`View my memes, ${creations.length} saved`}
                    >
                        <ImageIcon className="w-5 h-5" /> My Memes ({creations.length})
                    </button>
                </div>
            </header>
            <p className="text-gray-600 mb-4 text-xl">The SBF meme animator.</p>

            <div className="w-full bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg p-4 sm:p-6 space-y-4 border border-gray-200">
                <div className="w-full overflow-x-auto no-scrollbar" aria-label="Meme style suggestions">
                    <div className="w-max mx-auto flex items-center gap-x-2 sm:gap-x-3">
                    {promptSuggestions.map(({ emoji, prompt }) => {
                        const isActive = storyPrompt === prompt;
                        return (
                        <button
                            key={emoji}
                            onClick={() => handleSuggestionClick(prompt)}
                            className={`text-3xl p-2 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-gray-400 ${isActive ? 'bg-gray-300 scale-110' : 'hover:bg-gray-100'}`}
                            title={prompt}
                            aria-label={`${isActive ? 'Deselect' : 'Select'} meme prompt: ${prompt}`}
                        >
                            {emoji}
                        </button>
                        );
                    })}
                    </div>
                </div>

                <textarea
                    id="storyPrompt"
                    rows={2}
                    className="w-full bg-stone-50 text-gray-800 border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-gray-400 focus:border-gray-400 transition text-2xl resize-none placeholder:text-gray-400"
                    value={storyPrompt}
                    onChange={e => setStoryPrompt(e.target.value)}
                    placeholder="Describe the meme..."
                    aria-label="Meme prompt"
                />

                {error && (
                <div className="w-full bg-red-100 border-2 border-red-300 text-red-800 px-4 py-3 rounded-lg relative flex items-center justify-between animate-shake" role="alert">
                    <div className="pr-4">
                        <strong className="font-bold block">Error!</strong>
                        <span className="text-sm">{error}</span>
                    </div>
                    <button onClick={() => setError(null)} className="p-1 -mr-2 flex-shrink-0" aria-label="Close error message" >
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                </div>
                )}
                
                <div className="relative w-full aspect-square bg-gray-200 rounded-lg overflow-hidden shadow-inner flex items-center justify-center border-2 border-dashed border-gray-300">
                {originalImage ? (
                    <>
                        <img src={originalImage} alt="Preview" className="w-full h-full object-cover" />
                        <button onClick={handleClearImage} className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-800 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:ring-gray-500" aria-label="Remove image">
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center">
                        <p className="mb-4 text-gray-600 font-bold text-lg">1. Choose a classic SBF</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            {SBF_PRESETS.map((src, index) => (
                                <img 
                                    key={index}
                                    src={src}
                                    alt={`SBF Preset ${index + 1}`}
                                    onClick={() => handlePresetSelect(src)}
                                    className="cursor-pointer rounded-md w-full aspect-square object-cover border-2 border-gray-300 hover:border-gray-500 transition-all hover:scale-105"
                                />
                            ))}
                        </div>
                        <p className="mb-4 text-gray-600 text-lg">...or <span className="font-bold">upload your own</span></p>
                        <button onClick={handleUploadClick} className="w-48 bg-gray-600 text-white font-bold py-3 px-6 rounded-full hover:bg-gray-700 transition-colors duration-300 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-gray-400" aria-label="Upload an image from your device">
                            <UploadIcon className="w-6 h-6 mr-3" /> Upload
                        </button>
                    </div>
                )}
                </div>
                 <div className="pt-4 flex justify-center">
                    <button
                        onClick={() => handleCreateAnimation()}
                        className="w-64 h-16 bg-gray-800 text-white rounded-xl text-3xl font-bold shadow-lg border-b-4 border-black transition-all transform hover:scale-105 active:scale-95 active:border-b-2"
                        aria-label={'Create Meme'}
                    >
                        Create Meme!
                    </button>
                </div>
                
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </div>
            </div>
        );
      case AppState.Processing:
        return <LoadingOverlay />;
      case AppState.Animating:
        return animationAssets ? (
            <AnimationPlayer 
                assets={animationAssets} 
                prompt={storyPrompt}
                isSaved={!!currentCreationId && creations.some(c => c.id === currentCreationId)}
                onRegenerate={() => handleCreateAnimation(true)} 
                onBack={handleBackFromPlayer} 
                onSave={handleSaveCreation}
                isMuted={isMuted}
                onToggleMute={handleToggleMute}
            />
        ) : null;
      case AppState.Gallery:
        return <CreationsGallery 
                    creations={creations} 
                    onClose={() => setAppState(AppState.Capturing)}
                    onView={handleViewCreation}
                    onDelete={handleDeleteCreation}
                />;
      case AppState.Error:
        return (
          <div className="text-center bg-red-100 p-8 rounded-2xl shadow-lg max-w-md w-full text-red-800">
            <p className="text-4xl mb-4">😵</p>
            <p className="mb-6 font-medium text-lg">{error}</p>
            <button
              onClick={() => setAppState(AppState.Capturing)}
              className="bg-gray-800 text-white font-bold py-3 px-6 rounded-full hover:bg-gray-700 transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-red-100 focus-visible:ring-gray-500"
            >
              Try Again
            </button>
          </div>
        );
    }
  };

  return (
    <div className="relative min-h-dvh w-full">
        {SBF_PRESETS.map((src, index) => (
            <div
                key={src}
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${index === backgroundIndex ? 'opacity-100' : 'opacity-0'}`}
                style={{
                    backgroundImage: `url(${src})`,
                    filter: 'blur(16px)',
                    transform: 'scale(1.1)',
                }}
            />
        ))}
        <div className="absolute inset-0 bg-stone-100/80 backdrop-blur-sm" />
        <div className="relative h-dvh text-gray-800 flex flex-col items-center p-4 overflow-y-auto">
        {showApiKeyModal && <ApiKeyModal onSave={handleSaveApiKey} initialError={apiKeyError} />}
            <div className="w-full grow flex items-center justify-center">
                {renderContent()}
            </div>
            <footer className="w-full shrink-0 p-4 text-center">
                <p className="mb-2 text-2xl text-gray-600">SBF is back! lets meme</p>
                <a 
                    href="https://x.com/SBF_FTX/status/1970633704323362904" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-block max-w-sm w-full bg-white rounded-xl shadow-lg border border-gray-200 p-4 text-left transition-transform hover:scale-105 duration-300 ease-in-out"
                >
                    <div className="flex items-start space-x-3">
                        <img src="/assets/presets/sbf3.png" alt="SBF avatar" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                        <div className="flex-1">
                            <div className="flex items-baseline space-x-1">
                                <span className="font-bold text-gray-900">SBF</span>
                                <span className="text-gray-500">@SBF_FTX</span>
                            </div>
                            <p className="mt-1 text-2xl text-gray-800">
                                gm
                            </p>
                        </div>
                    </div>
                </a>
            </footer>
        </div>
    </div>
  );
};

export default App;
