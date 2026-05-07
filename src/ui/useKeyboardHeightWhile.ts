import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * Keyboard overlap height while `enabled` (e.g. modal open). Use as bottom margin
 * on bottom sheets so lists stay above the keyboard.
 */
export function useKeyboardHeightWhile(enabled: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setHeight(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates.height);
    const onHide = () => setHeight(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [enabled]);
  return height;
}
