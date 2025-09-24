/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';

interface ApiKeyModalProps {
    onSave: (apiKey: string) => void;
    initialError?: string | null;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave, initialError }) => {
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState<string | null>(initialError || null);

    const handleSave = () => {
        const trimmedKey = apiKey.trim();
        if (!trimmedKey) {
            setError('Please enter a valid API key.');
            return;
        }
        setError(null);
        onSave(trimmedKey);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md text-center space-y-4 border-2 border-gray-300">
                <h2 className="text-4xl text-gray-800">Your Gemini API Key</h2>
                <p className="text-gray-600 text-xl">
                    To make memes with 'gm SBF', please enter your Google Gemini API key. It's only saved in your browser.
                </p>
                
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key here..."
                    className="w-full bg-stone-50 text-gray-800 border-2 border-gray-200 rounded-lg px-4 py-3 focus:ring-gray-400 focus:border-gray-400 transition text-2xl"
                    aria-label="Gemini API Key Input"
                />

                {error && (
                    <p className="text-red-600 text-lg animate-shake">{error}</p>
                )}

                <button
                    onClick={handleSave}
                    className="w-full bg-gray-800 text-white rounded-xl text-2xl font-bold shadow-lg py-3 border-b-4 border-black transition-all transform hover:scale-105 active:scale-95 active:border-b-2"
                >
                    Save & Create
                </button>

                <p className="text-gray-500 text-lg">
                    Don't have a key? Get one from {' '}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-gray-700 underline hover:text-black">
                        Google AI Studio
                    </a>.
                </p>
            </div>
        </div>
    );
};

export default ApiKeyModal;