import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { getStoredSettings } from '../services/storage';

class SoundManager {
  constructor() {
    this.soundObject = null;
    this.lastTriggerTime = 0;
  }

  async triggerSignalAlert(type = 'BULLISH') {
    const now = Date.now();
    // Debounce alerts to once every 10 seconds to avoid spamming the trader
    if (now - this.lastTriggerTime < 10000) return;
    this.lastTriggerTime = now;

    const { soundEnabled, hapticEnabled } = await getStoredSettings();

    // Haptic feedback
    if (hapticEnabled) {
      try {
        if (type === 'BULLISH') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (type === 'BEARISH') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
      } catch (e) {
        console.log('Haptics error:', e);
      }
    }

    // Audio beep/sound
    if (soundEnabled) {
      try {
        // High frequency synthesized beep pattern for trading signals
        // We use an online clean audio notification or Expo Audio
        const { sound } = await Audio.Sound.createAsync(
          type === 'BULLISH'
            ? { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' } // pleasant chime
            : { uri: 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3' }, // alert tone
          { shouldPlay: true, volume: 1.0 }
        );
        this.soundObject = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            sound.unloadAsync();
          }
        });
      } catch (e) {
        console.log('Sound alert error:', e);
      }
    }
  }

  async testSound() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
        { shouldPlay: true, volume: 1.0 }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.log('Test sound failed:', e);
    }
  }
}

export const soundManager = new SoundManager();
