/** The tone module loads only after an explicit play while the scene is allowed to work. */
export const sceneAudio = {
  async play(volume = 1): Promise<void> {
    const { playSceneTone } = await import('./scene-sound');
    await playSceneTone(volume);
  },
};
