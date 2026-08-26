/**
 * Arguments for deciding whether the walk-radius circle should bloom.
 */
export interface ShouldBloomRadiusCircleArguments {
  radiusCircleBloomToken: number;
  previousBloomToken: number;
  prefersReducedMotion: boolean;
}

/**
 * True only when the circle first becomes visible (token advanced), not on slider drags.
 */
export function shouldBloomRadiusCircle(
  arguments_: ShouldBloomRadiusCircleArguments,
): boolean {
  if (arguments_.prefersReducedMotion) {
    return false;
  }
  if (arguments_.radiusCircleBloomToken === 0) {
    return false;
  }
  return arguments_.radiusCircleBloomToken !== arguments_.previousBloomToken;
}
