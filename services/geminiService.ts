/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/



import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Frame } from "../types";

export interface AnimationAssets {
  imageData: { data: string, mimeType: string };
  frames: Frame[];
  frameDuration: number;
}

const base64ToGenerativePart = (base64: string, mimeType: string) => {
    return {
      inlineData: {
        data: base64,
        mimeType,
      },
    };
};

export const generateAnimationAssets = async (
    apiKey: string,
    base64UserImage: string | null,
    mimeType: string | null,
    imagePrompt: string,
    onProgress: (message: string) => void
): Promise<AnimationAssets | null> => {
  const ai = new GoogleGenAI({ apiKey });
  const imageModel = 'gemini-2.5-flash-image-preview';

  try {
    const imageGenTextPart = { text: imagePrompt };
    const parts = [];

    if (base64UserImage && mimeType) {
        const userImagePart = base64ToGenerativePart(base64UserImage, mimeType);
        parts.push(userImagePart);
    }
    parts.push(imageGenTextPart);
    
    const imageGenResponse: GenerateContentResponse = await ai.models.generateContent({
        model: imageModel,
        contents: [{
            role: "user",
            parts: parts,
        }],
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    const responseParts = imageGenResponse.candidates?.[0]?.content?.parts;
    if (!responseParts) {
        throw new Error("Invalid response from model. No parts found.");
    }

    const imagePart = responseParts.find(p => p.inlineData);
    if (!imagePart?.inlineData?.data) {
        console.error("No image part found in response from image generation model", imageGenResponse);
        const text = responseParts.find(p => p.text)?.text;
        throw new Error(`Model did not return an image. Response: ${text ?? "<no text>"}`);
    }
    const imageData = { data: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
    
    // Extract and parse frame duration from the text part
    let frameDuration = 120; // Default fallback value
    const textPart = responseParts.find(p => p.text);
    if (textPart?.text) {
        try {
            // The model might return just the JSON, or text with JSON embedded.
            // A simple regex to find a JSON-like string.
            const jsonStringMatch = textPart.text.match(/{.*}/s);
            if (jsonStringMatch) {
                const parsed = JSON.parse(jsonStringMatch[0]);
                if (parsed.frameDuration && typeof parsed.frameDuration === 'number') {
                    frameDuration = parsed.frameDuration;
                }
            }
        } catch (e) {
            console.warn("Could not parse frame duration from model response. Using default.", e);
        }
    }

    return { imageData, frames: [], frameDuration };
  } catch (error) {
    console.error("Error during asset generation:", error);
    // Rethrow a more user-friendly error to be caught by the UI
    if (error instanceof Error) {
        if (error.message.includes('API key not valid')) {
            throw new Error('Your API key is not valid. Please check and try again.');
        }
        if (error.message.includes('quota')) {
            throw new Error('You have exceeded your API quota. Please check your account.');
        }
    }
    throw new Error(`Failed to generate animation. ${error instanceof Error ? error.message : ''}`);
  }
};