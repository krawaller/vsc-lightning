let lightningFileOpenDepth = 0;

export async function runWithLightningFileOpen<T>(
  operation: () => Thenable<T> | Promise<T>,
): Promise<T> {
  lightningFileOpenDepth += 1;
  try {
    return await operation();
  } finally {
    lightningFileOpenDepth -= 1;
  }
}

export function isLightningFileOpenInProgress(): boolean {
  return lightningFileOpenDepth > 0;
}
