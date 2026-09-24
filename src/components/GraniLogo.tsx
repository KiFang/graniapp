import Svg, { Polygon, Rect } from 'react-native-svg';

interface Props {
  size?: number;
  /** Цвета левой и правой граней; центр — всегда белый */
  left?: string;
  right?: string;
  center?: string;
  background?: string;
}

/** Логотип гильдии «Грани»: три треугольника на чёрном поле. */
export function GraniLogo({ size = 48, left = '#80FFF8', right = '#2BB8B4', center = '#FFFFFF', background }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1050 1050">
      {background ? <Rect width="1050" height="1050" fill={background} /> : null}
      <Polygon points="373,0 671,0 522,1050" fill={center} />
      <Polygon points="276,505 276,1050 522,1050" fill={left} />
      <Polygon points="771,505 771,1050 522,1050" fill={right} />
    </Svg>
  );
}
