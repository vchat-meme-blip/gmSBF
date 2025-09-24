/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Creation } from '../types';
import { XCircleIcon, TrashIcon } from './icons';

interface CreationsGalleryProps {
    creations: Creation[];
    onClose: () => void;
    onView: (creation: Creation) => void;
    onDelete: (id: string) => void;
}

const CreationsGallery: React.FC<CreationsGalleryProps> = ({ creations, onClose, onView, onDelete }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] flex flex-col border-2 border-gray-300"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h2 id="gallery-title" className="text-4xl text-gray-800">
                        My Memes
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-gray-500 hover:text-gray-800 transition-colors"
                        aria-label="Close gallery"
                    >
                        <XCircleIcon className="w-8 h-8" />
                    </button>
                </div>
                {creations.length > 0 ? (
                    <div className="overflow-y-auto no-scrollbar pr-2 -mr-2">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {creations.map(creation => (
                                <div key={creation.id} className="relative group aspect-square">
                                    <img 
                                        src={`data:${creation.assets.imageData.mimeType};base64,${creation.assets.imageData.data}`} 
                                        alt={creation.prompt || 'Saved animation'}
                                        onClick={() => onView(creation)} 
                                        className="cursor-pointer rounded-lg shadow-md w-full h-full object-cover transition-all duration-300 ease-in-out group-hover:scale-105 group-hover:shadow-xl border border-gray-200" 
                                    />
                                    <div 
                                        onClick={() => onView(creation)}
                                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg"
                                    >
                                        <p className="text-white text-center text-xs sm:text-sm p-2 line-clamp-3">{creation.prompt || 'View'}</p>
                                    </div>
                                    <button 
                                        onClick={() => onDelete(creation.id)} 
                                        className="absolute top-2 right-2 bg-white/70 text-red-600 hover:bg-white hover:text-red-500 p-1.5 rounded-full transition-all opacity-50 group-hover:opacity-100"
                                        aria-label="Delete meme"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-700 bg-gray-50 rounded-lg p-8 border border-dashed border-gray-300">
                        <p className="text-5xl mb-4">✍️</p>
                        <p className="text-xl font-medium">Your meme gallery is empty!</p>
                        <p className="text-sm text-gray-500 mt-1">Create an animated meme to see it here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreationsGallery;