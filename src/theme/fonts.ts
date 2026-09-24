import {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from '@expo-google-fonts/montserrat';

/** Montserrat: у кастомного шрифта вес задаётся семейством, а не fontWeight */
export const FONT_ASSETS = {
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
};

export const F = {
  regular: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
  heavy: 'Montserrat_800ExtraBold',
  black: 'Montserrat_900Black',
} as const;
