/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { AnimationAssets } from './services/geminiService';

export enum AppState {
  Capturing,
  Processing,
  Animating,
  Error,
  Gallery,
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Creation {
    id: string;
    assets: AnimationAssets;
    prompt: string;
}