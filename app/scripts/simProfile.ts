/**
 * Профиль пользователя из docs/USER_REVIEW.md — общий для всех прогонов,
 * чтобы цифры разных запусков можно было сравнивать между собой.
 */
import type { EaterProfile } from '../src/core/types';

export function makeEaterLike(patch: Partial<EaterProfile> = {}): EaterProfile {
  return {
    id: 'sim',
    name: 'Я',
    sex: 'male',
    age: 32,
    heightCm: 180,
    weightKg: 82,
    activity: 'sedentary',
    goal: 'maintain',
    excludedProducts: [],
    dietTags: [],
    ...patch,
  };
}
