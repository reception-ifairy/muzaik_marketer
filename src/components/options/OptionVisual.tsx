import React from 'react';
import {
  Brush, Building2, Camera, Crown, Flower2, Frame, Gem, Lamp, Landmark, Layers, Leaf, Mountain, Music, Palette, Shapes,
  Shirt, Smile, Sofa, Sparkles, Star, Sun, SwatchBook, Type, Wand2, type LucideIcon,
} from 'lucide-react';
import type { GroupIcon as GroupIconName, OptionGroup, OptionItem } from '../../options';
import { cn } from '../../lib/utils';

const ICONS: Record<GroupIconName, LucideIcon> = {
  Palette, Landmark, Brush, Crown, Sun, Smile, SwatchBook, Frame, Music, Camera, Shapes, Sparkles,
  Layers, Lamp, Sofa, Shirt, Leaf, Mountain, Building2, Gem, Type, Wand2, Flower2, Star,
};

export function GroupIcon({ icon, size = 20, className }: { icon: GroupIconName; size?: number; className?: string }) {
  const Icon = ICONS[icon] ?? Sparkles;
  return <Icon size={size} className={className} />;
}

/**
 * What an option shows (Kuźnia's forge-option-visual): its sample picture, a palette's real colours, a
 * composition diagram, or the group's icon until the picture exists. Drawn ones take the group's colour.
 */
export default function OptionVisual({ group, option, round = false, large = false }: { group: OptionGroup; option: OptionItem; round?: boolean; large?: boolean }) {
  const shape = round ? 'rounded-full' : '';
  if (option.sample) {
    return <img src={option.sample} alt="" loading="lazy" width={256} height={256} draggable={false} className={cn('w-full h-full object-cover', shape)} />;
  }
  if (option.colors?.length) {
    const step = 100 / option.colors.length;
    const stops = option.colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ');
    return <span className={cn('block w-full h-full', shape)} style={{ background: `conic-gradient(${stops})` }} />;
  }
  if (group.kind === 'diagram') {
    return (
      <svg aria-hidden="true" viewBox="0 0 48 48" className={cn('w-full h-full bg-brand-raised', shape)} style={{ color: 'var(--tone)' }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <Diagram code={option.code} />
      </svg>
    );
  }
  return (
    <span className={cn('grid place-items-center w-full h-full bg-gradient-to-br from-brand-raised to-black', shape)} style={{ color: 'var(--tone)' }}>
      <GroupIcon icon={group.icon} size={large ? 96 : 28} className="opacity-80" />
    </span>
  );
}

function Diagram({ code }: { code: string }) {
  switch (code) {
    case 'close_up':
      return <circle cx="24" cy="24" r="15" fill="currentColor" fillOpacity=".35" />;
    case 'centered':
      return (
        <>
          <path d="M24 10v28M10 24h28" strokeOpacity=".35" />
          <circle cx="24" cy="24" r="6" fill="currentColor" />
        </>
      );
    case 'symmetrical':
      return (
        <>
          <path d="M24 9v30" strokeDasharray="3 3" />
          <path d="M14 30l5-12 5 12M34 30l-5-12-5 12" />
        </>
      );
    case 'thirds':
      return (
        <>
          <path d="M19 9v30M29 9v30M9 19h30M9 29h30" strokeOpacity=".45" />
          <circle cx="29" cy="19" r="4" fill="currentColor" />
        </>
      );
    case 'panorama':
      return (
        <>
          <path d="M8 28h32" />
          <path d="M8 28l7-6 6 4 8-8 11 10" strokeOpacity=".7" />
        </>
      );
    case 'birds_eye':
      return (
        <>
          <circle cx="24" cy="24" r="12" strokeOpacity=".45" />
          <circle cx="24" cy="24" r="4" fill="currentColor" />
          <path d="M24 6v6" />
        </>
      );
    case 'low_angle':
      return (
        <>
          <path d="M16 38 21 12h6l5 26z" fill="currentColor" fillOpacity=".3" />
          <path d="M24 42v-4" />
        </>
      );
    case 'flat_lay':
      return (
        <>
          <rect x="13" y="13" width="9" height="9" rx="1" />
          <rect x="26" y="15" width="9" height="7" rx="1" />
          <circle cx="18" cy="31" r="4" />
          <rect x="26" y="27" width="9" height="8" rx="1" />
        </>
      );
    case 'negative_space':
      return <circle cx="33" cy="33" r="3" fill="currentColor" />;
    default:
      return (
        <>
          {[15, 24, 33].flatMap((y) => [15, 24, 33].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="currentColor" />))}
        </>
      );
  }
}
