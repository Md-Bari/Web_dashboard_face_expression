import { Angry, Annoyed, Frown, Meh, Smile, Zap, type LucideIcon } from 'lucide-react';

/**
 * The six expression classes the model is trained on, in display order. Colours come from the
 * validated categorical palette, ordered so neighbouring classes (stacks, donut) stay distinct
 * for colour-blind viewers. Light-mode aqua/yellow are below 3:1 contrast, so every chart that
 * uses them also shows text labels.
 */
export const EMOTIONS = ['happy', 'surprise', 'neutral', 'fear', 'sad', 'angry'] as const;
export type EmotionType = (typeof EMOTIONS)[number];

export const EMOTION_META: Record<EmotionType, { label: string; color: string; pill: string; icon: LucideIcon }> = {
  happy: { label: 'Happy', color: '#1baf7a', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Smile },
  surprise: { label: 'Surprise', color: '#eb6834', pill: 'bg-orange-50 text-orange-700 border-orange-200', icon: Zap },
  neutral: { label: 'Neutral', color: '#2a78d6', pill: 'bg-blue-50 text-blue-700 border-blue-200', icon: Meh },
  fear: { label: 'Fear', color: '#eda100', pill: 'bg-amber-50 text-amber-800 border-amber-200', icon: Annoyed },
  sad: { label: 'Sad', color: '#6250d6', pill: 'bg-violet-50 text-violet-700 border-violet-200', icon: Frown },
  angry: { label: 'Angry', color: '#e34948', pill: 'bg-rose-50 text-rose-700 border-rose-200', icon: Angry },
};

export function emotionMeta(emotion: string | undefined) {
  return EMOTION_META[(emotion as EmotionType) in EMOTION_META ? (emotion as EmotionType) : 'neutral'];
}

export type EmotionRecord = Record<EmotionType, number>;

export const EMPTY_EMOTIONS: EmotionRecord = { happy: 0, surprise: 0, neutral: 0, fear: 0, sad: 0, angry: 0 };
