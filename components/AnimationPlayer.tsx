/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimationAssets } from '../services/geminiService';
import { Frame } from '../types';
import Spinner from './BananaLoader';
import { InfoIcon, XCircleIcon, SettingsIcon, ArrowLeftIcon, SaveIcon, ShareIcon, TwitterIcon, RefreshCwIcon, DownloadIcon, Volume2Icon, VolumeXIcon } from './icons';

// Add declaration for the gifshot library loaded from CDN
declare var gifshot: any;

// --- DEBUG FLAG ---
// Set to `true` to disable the share button for testing layout.
const DISABLE_SHARE_BUTTON = false;

interface AnimationPlayerProps {
  assets: AnimationAssets;
  prompt: string;
  isSaved: boolean;
  onRegenerate: () => void;
  onBack: () => void;
  onSave: (assets: AnimationAssets, prompt: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

interface AnimationConfig {
  speed: number;
}

const DEFAULT_CONFIG: AnimationConfig = {
  speed: 120, // ms per frame
};

const Confetti: React.FC = () => {
    const confettiColors = ['bg-yellow-300', 'bg-green-400', 'bg-blue-400', 'bg-red-400', 'bg-pink-400', 'bg-purple-400'];
    const particles = Array.from({ length: 50 });

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {particles.map((_, i) => {
                const style: React.CSSProperties = {
                    left: `${Math.random() * 100}%`,
                    animationName: 'confetti-fall',
                    animationDuration: `${Math.random() * 2 + 3}s`,
                    animationDelay: `${Math.random() * 4}s`,
                    animationTimingFunction: 'linear',
                    animationIterationCount: '1',
                };
                const color = confettiColors[i % confettiColors.length];
                const size = Math.random() > 0.5 ? 'w-2 h-4' : 'w-3 h-3';
                const shape = Math.random() > 0.5 ? 'rounded-full' : '';

                return <div key={i} className={`absolute top-0 opacity-0 ${color} ${size} ${shape}`} style={style} />;
            })}
        </div>
    );
};


const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    if (arr.length < 2) {
        throw new Error('Invalid data URL');
    }
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) {
        throw new Error('Could not parse MIME type from data URL');
    }
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}


const ControlSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    helpText: string;
}> = ({ label, value, min, max, step, onChange, helpText }) => (
    <div>
        <label htmlFor={label} className="block text-sm font-medium text-gray-700">
            {label}
        </label>
        <div className="flex items-center gap-3 mt-1">
            <input
                id={label}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-600"
            />
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                onChange={e => onChange(Number(e.target.value))}
                className="w-20 bg-gray-100 text-gray-800 border border-gray-300 rounded-md px-2 py-1 text-center"
            />
        </div>
        <p className="text-xs text-gray-500 mt-2">{helpText}</p>
    </div>
);

const AnimationPlayer: React.FC<AnimationPlayerProps> = ({ assets, prompt, isSaved, onRegenerate, onBack, onSave, isMuted, onToggleMute }) => {
  const [frames, setFrames] = useState<HTMLImageElement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showControls, setShowControls] = useState(false);
  const [config, setConfig] = useState<AnimationConfig>({
    ...DEFAULT_CONFIG,
    speed: assets.frameDuration || DEFAULT_CONFIG.speed,
  });
  const [viewMode, setViewMode] = useState<'animation' | 'spritesheet'>('animation');
  const animationFrameId = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number>(0);
  
  const [spriteSheetImage, setSpriteSheetImage] = useState<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [displayFrames, setDisplayFrames] = useState<Frame[]>([]);
  const [pendingAction, setPendingAction] = useState<'export' | 'share' | null>(null);

  const isShareAvailable = typeof navigator !== 'undefined' && navigator.share && !DISABLE_SHARE_BUTTON;

  const processSpriteSheet = useCallback((img: HTMLImageElement, frameLayout: Frame[]) => {
    if (!frameLayout || frameLayout.length === 0) {
        console.error("processSpriteSheet called with no frame layout.");
        setFrames([]);
        setIsLoading(false);
        return;
    }

    const framePromises: Promise<HTMLImageElement>[] = frameLayout.map(frame => {
      return new Promise((resolve, reject) => {
        if (frame.width <= 0 || frame.height <= 0) {
            console.error("Invalid frame dimensions for slicing:", frame);
            // Resolve with a 1x1 transparent pixel to avoid breaking Promise.all
            const emptyImage = new Image();
            emptyImage.onload = () => resolve(emptyImage);
            emptyImage.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
            return;
        }
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = frame.width;
        frameCanvas.height = frame.height;
        const frameCtx = frameCanvas.getContext('2d');
        if (frameCtx) {
          frameCtx.drawImage(img, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
        }
        const frameImage = new Image();
        frameImage.onload = () => resolve(frameImage);
        frameImage.onerror = () => reject(new Error('Failed to load sliced frame image'));
        frameImage.src = frameCanvas.toDataURL();
      });
    });

    Promise.all(framePromises).then(loadedFrames => {
      setFrames(loadedFrames);
      setIsLoading(false);
    }).catch(error => {
        console.error("Error loading frame images:", error);
        setIsLoading(false);
    });
  }, []);
  
  const performExport = useCallback(() => {
    if (frames.length === 0 || !canvasRef.current) return;
    setIsExporting(true);

    const imageUrls = frames.map(frame => frame.src);
    const intervalInSeconds = config.speed / 1000;
    const gifWidth = canvasRef.current.width;
    const gifHeight = canvasRef.current.height;

    gifshot.createGIF({
        images: imageUrls,
        gifWidth: gifWidth,
        gifHeight: gifHeight,
        interval: intervalInSeconds,
        numWorkers: 2,
    }, (obj: { error: boolean; image: string; errorMsg: string }) => {
        setIsExporting(false);
        if (!obj.error) {
            const a = document.createElement('a');
            a.href = obj.image;
            a.download = 'sbf-meme.gif';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            console.error('GIF export failed:', obj.errorMsg);
        }
    });
  }, [frames, config.speed]);

  const performShare = useCallback(async () => {
    if (!isShareAvailable || frames.length === 0 || !canvasRef.current) return;
    setIsSharing(true);

    const imageUrls = frames.map(frame => frame.src);
    const intervalInSeconds = config.speed / 1000;

    gifshot.createGIF({
        images: imageUrls,
        gifWidth: canvasRef.current.width,
        gifHeight: canvasRef.current.height,
        interval: intervalInSeconds,
        numWorkers: 2,
    }, async (obj: { error: boolean; image: string; errorMsg: string }) => {
        setIsSharing(false);
        if (!obj.error) {
            try {
                const blob = dataURLtoBlob(obj.image);
                const file = new File([blob], "sbf-meme.gif", { type: "image/gif" });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'My SBF Meme',
                        text: 'Check out this SBF meme I created!',
                    });
                } else {
                    console.error("Sharing not supported for these files.");
                    alert("Your browser doesn't support sharing this file.");
                }
            } catch (error) {
                console.error('Error sharing GIF:', error);
                if (error instanceof Error && error.name !== 'AbortError') {
                  alert(`Sharing failed: ${error.message}`);
                }
            }
        } else {
            console.error('GIF export for sharing failed:', obj.errorMsg);
            alert(`Could not create GIF for sharing: ${obj.errorMsg}`);
        }
    });
  }, [frames, config.speed, isShareAvailable]);
  
  const handleTwitterShare = () => {
    const shareText = `Check out this animation I made about "${prompt}" with #gmSBF!`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank');
  };

  useEffect(() => {
    if (!isLoading) {
        const audio = new Audio('/assets/sounds/pop.mp3');
        audio.play().catch(error => console.warn("Could not play sound:", error));
    }
  }, [isLoading]);

  useEffect(() => {
    if (pendingAction && viewMode === 'animation' && canvasRef.current) {
        if (pendingAction === 'export') {
            performExport();
        } else if (pendingAction === 'share') {
            performShare();
        }
        setPendingAction(null);
    }
  }, [pendingAction, viewMode, performExport, performShare]);

  useEffect(() => {
    if (!assets.imageData || !assets.imageData.data) {
        setIsLoading(false);
        return;
    }
    
    setIsLoading(true);
    setFrames([]);

    const img = new Image();
    img.onload = () => {
        setSpriteSheetImage(img);
        
        const { naturalWidth, naturalHeight } = img;
        console.log(`[DEBUG] Received sprite sheet with dimensions: ${naturalWidth}x${naturalHeight}`);
        const frameWidth = Math.floor(naturalWidth / 3);
        const frameHeight = Math.floor(naturalHeight / 3);
        const frameLayout: Frame[] = [];
        const cropAmount = 10;

        for (let i = 0; i < 9; i++) {
            const initialX = (i % 3) * frameWidth;
            const initialY = Math.floor(i / 3) * frameHeight;
            frameLayout.push({ 
                x: initialX + cropAmount, 
                y: initialY + cropAmount, 
                width: frameWidth - (cropAmount * 2), 
                height: frameHeight - (cropAmount * 2) 
            });
        }
        
        setDisplayFrames(frameLayout);
        processSpriteSheet(img, frameLayout);
    }
    img.onerror = () => {
        console.error("Failed to load generated image.");
        setIsLoading(false);
    }
    img.src = `data:${assets.imageData.mimeType};base64,${assets.imageData.data}`;
  }, [assets, processSpriteSheet]);

  useEffect(() => {
    if (frames.length === 0 || !canvasRef.current || isLoading || viewMode !== 'animation') {
      if(animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 512;
    canvas.height = 512;
    
    const animate = (timestamp: number) => {
      if(animationStartTimeRef.current === 0) animationStartTimeRef.current = timestamp;
      
      const totalDuration = frames.length * config.speed;
      const elapsedTime = (timestamp - animationStartTimeRef.current) % totalDuration;
      const currentFrameIndex = Math.floor(elapsedTime / config.speed);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frames[currentFrameIndex], 0, 0, canvas.width, canvas.height);
      
      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [frames, config, isLoading, viewMode]);
  
  const getImageDisplayDimensions = useCallback(() => {
    if (!spriteSheetImage || !containerRef.current) {
      return { x: 0, y: 0, width: 0, height: 0, scale: 1 };
    }
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const imgRatio = spriteSheetImage.naturalWidth / spriteSheetImage.naturalHeight;
    const containerRatio = containerRect.width / containerRect.height;
    let finalWidth, finalHeight, offsetX, offsetY;
  
    if (imgRatio > containerRatio) {
      finalWidth = containerRect.width;
      finalHeight = finalWidth / imgRatio;
      offsetX = 0;
      offsetY = (containerRect.height - finalHeight) / 2;
    } else {
      finalHeight = containerRect.height;
      finalWidth = finalHeight * imgRatio;
      offsetY = 0;
      offsetX = (containerRect.width - finalWidth) / 2;
    }
  
    return {
      width: finalWidth,
      height: finalHeight,
      x: offsetX,
      y: offsetY,
      scale: finalWidth / spriteSheetImage.naturalWidth,
    };
  }, [spriteSheetImage]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    const img = spriteSheetImage;

    if (viewMode !== 'spritesheet' || !canvas || !container || !img || displayFrames.length === 0) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const drawGrid = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerRect = container.getBoundingClientRect();
      canvas.width = containerRect.width;
      canvas.height = containerRect.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const color = '#78716c'; // stone-500
      
      const { scale, x: offsetX, y: offsetY } = getImageDisplayDimensions();
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      
      displayFrames.forEach((frame) => {
          const rectX = frame.x * scale + offsetX;
          const rectY = frame.y * scale + offsetY;
          const rectW = frame.width * scale;
          const rectH = frame.height * scale;
          ctx.strokeRect(rectX, rectY, rectW, rectH);
      });
    };

    const resizeObserver = new ResizeObserver(drawGrid);
    resizeObserver.observe(container);
    drawGrid();

    return () => {
      resizeObserver.disconnect();
    };
// FIX: Fix typo from `viewModule` to `viewMode`.
  }, [viewMode, spriteSheetImage, displayFrames, getImageDisplayDimensions]);


 const handleExport = () => {
// FIX: Fix typo from `viewModule` to `viewMode`.
    if (viewMode === 'spritesheet') {
// FIX: Fix typo from `setViewModule` to `setViewMode`.
        setViewMode('animation');
        setPendingAction('export');
    } else {
        performExport();
    }
 };
 
  const handleShare = () => {
// FIX: Fix typo from `viewModule` to `viewMode`.
    if (viewMode === 'spritesheet') {
// FIX: Fix typo from `setViewModule` to `setViewMode`.
        setViewMode('animation');
        setPendingAction('share');
    } else {
        performShare();
    }
  };

  const ActionButton: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    className: string;
    children: React.ReactNode;
    'aria-label': string;
  }> = ({ onClick, disabled, className, children, 'aria-label': ariaLabel }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full text-sm font-bold py-3 px-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        aria-label={ariaLabel}
    >
        {children}
    </button>
  );

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto">
      <div 
        ref={containerRef} 
        className="relative w-full aspect-square bg-gray-200 border-2 border-gray-300 rounded-2xl overflow-hidden shadow-2xl mb-4 flex items-center justify-center"
        >
        {!isLoading && <Confetti />}
        {isLoading ? (
           <div className="flex flex-col items-center justify-center text-center p-8">
            <Spinner />
          </div>
        ) : (
            <>
              <button 
                onClick={onBack}
                className="absolute top-4 left-4 z-20 bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-800 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-200 focus-visible:ring-gray-500"
                aria-label="Go back"
              >
                  <ArrowLeftIcon className="w-6 h-6" />
              </button>
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                <button
                    onClick={onToggleMute}
                    className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-800 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-200 focus-visible:ring-gray-500"
                    aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
                >
                    {isMuted ? <VolumeXIcon className="w-6 h-6" /> : <Volume2Icon className="w-6 h-6" />}
                </button>
                {viewMode === 'animation' && (
                  <button
                    onClick={() => setShowControls(prev => !prev)}
                    className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-800 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-200 focus-visible:ring-gray-500"
                    aria-label={showControls ? 'Hide animation controls' : 'Show animation controls'}
                  >
                    <SettingsIcon className={`w-6 h-6 transition-colors ${showControls ? 'text-gray-600' : ''}`} />
                  </button>
                )}
                <button
                  onClick={() => {
                    const newMode = viewMode === 'animation' ? 'spritesheet' : 'animation';
                    setViewMode(newMode);
                    if (newMode === 'spritesheet') {
                      setShowControls(false);
                    }
                  }}
                  className="bg-white/80 backdrop-blur-sm p-2 rounded-full text-gray-800 hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-200 focus-visible:ring-gray-500"
                  aria-label={viewMode === 'animation' ? 'Show info and sprite sheet' : 'Close info and show animation'}
                >
                  {viewMode === 'animation' ? <InfoIcon className="w-6 h-6" /> : <XCircleIcon className="w-6 h-6 text-gray-600" />}
                </button>
              </div>

              {viewMode === 'animation' && (
                <canvas ref={canvasRef} className={'w-full aspect-square object-contain'} />
              )}
              {viewMode === 'spritesheet' && spriteSheetImage && (
                <>
                  <img 
                      src={spriteSheetImage.src} 
                      alt="Generated Sprite Sheet" 
                      className="max-w-full max-h-full object-contain bg-gray-200" 
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-4 text-center z-10 backdrop-blur-sm">
                    <p className="text-sm text-gray-200 max-w-prose mx-auto">
                        This animation was created from a single AI-generated sprite sheet.
                    </p>
                  </div>
                </>
              )}
               {frames.length === 0 && !isLoading && viewMode === 'animation' && (
                  <div className="text-center text-red-400 p-4">
                      <h3 className="text-lg font-bold">No frames found</h3>
                      <p className="text-sm">Could not extract frames from the source image.</p>
                  </div>
              )}
            </>
        )}
        <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 pointer-events-none" />
        {showControls && viewMode === 'animation' && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 p-4 z-30 backdrop-blur-sm space-y-2 text-gray-800 border-t border-gray-200">
            <ControlSlider label="Animation Speed (ms/frame)" value={config.speed} min={16} max={2000} step={1} onChange={v => setConfig(c => ({...c, speed: v}))} helpText="Lower values are faster. Frame duration can be up to 2 seconds."/>
            <button onClick={() => setConfig({ ...DEFAULT_CONFIG, speed: assets.frameDuration || DEFAULT_CONFIG.speed })} className="text-sm text-gray-600 hover:text-gray-500">Reset to Defaults</button>
          </div>
        )}
      </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-lg">
        <ActionButton onClick={onRegenerate} className="bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500" aria-label="Regenerate meme">
            <RefreshCwIcon className="w-5 h-5" /> Regenerate
        </ActionButton>

        <ActionButton onClick={() => onSave(assets, prompt)} disabled={isSaved} className="bg-gray-500 text-white hover:bg-gray-600 focus-visible:ring-gray-500" aria-label="Save to collection">
             <SaveIcon className="w-5 h-5" /> {isSaved ? 'Saved' : 'Save'}
        </ActionButton>

        <ActionButton onClick={handleExport} disabled={isExporting} className="bg-green-500 text-white hover:bg-green-600 focus-visible:ring-green-500" aria-label="Export as GIF">
            <DownloadIcon className="w-5 h-5" /> {isExporting ? 'Exporting...' : 'Export GIF'}
        </ActionButton>
        
        {isShareAvailable && (
            <ActionButton onClick={handleShare} disabled={isSharing} className="bg-blue-500 text-white hover:bg-blue-600 focus-visible:ring-blue-500 col-span-2 sm:col-span-1" aria-label="Share animation">
                <ShareIcon className="w-5 h-5" /> {isSharing ? 'Sharing...' : 'Share'}
            </ActionButton>
        )}

        <ActionButton onClick={handleTwitterShare} className="bg-[#1DA1F2] text-white hover:bg-[#0c85d0] focus-visible:ring-[#1DA1F2] col-span-2 sm:col-span-2" aria-label="Share on Twitter">
            <TwitterIcon className="w-5 h-5" /> Share on Twitter
        </ActionButton>
    </div>
    </div>
  );
};

export default AnimationPlayer;