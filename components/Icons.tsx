interface IconProps {
  size?: number;
  className?: string;
}

function Icon({
  d,
  size = 16,
  sw = 1.5,
  fill = "none",
  children,
}: {
  d?: string;
  size?: number;
  sw?: number;
  fill?: string;
  children?: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const ChevronRight = ({ size = 16 }: IconProps) => <Icon size={size} d="M9 6l6 6-6 6" />;
export const ChevronLeft = ({ size = 16 }: IconProps) => <Icon size={size} d="M15 6l-6 6 6 6" />;
export const ChevronDown = ({ size = 16 }: IconProps) => <Icon size={size} d="M6 9l6 6 6-6" />;
export const Plus = ({ size = 16 }: IconProps) => <Icon size={size} d="M12 5v14M5 12h14" />;
export const X = ({ size = 16 }: IconProps) => <Icon size={size} d="M6 6l12 12M18 6L6 18" />;
export const Check = ({ size = 16 }: IconProps) => <Icon size={size} d="M5 12l5 5L20 7" />;
export const Send = ({ size = 16 }: IconProps) => (
  <Icon size={size}><path d="M5 12l14-7-5 16-3-7-6-2z" /></Icon>
);
export const Sparkle = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8" />
  </Icon>
);
export const Paperclip = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M20 12.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
);
export const ImageIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-5-5-9 9" />
  </Icon>
);
export const Link = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 7M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17" />
);
export const Doc = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);
export const Code = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M9 8l-5 4 5 4M15 8l5 4-5 4M14 4l-4 16" />
);
export const Slack = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="10" width="6" height="4" rx="2" />
    <rect x="10" y="3" width="4" height="6" rx="2" />
    <rect x="15" y="10" width="6" height="4" rx="2" />
    <rect x="10" y="15" width="4" height="6" rx="2" />
  </Icon>
);
export const Calendar = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);
export const Refresh = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0 1 14-3M20 14a8 8 0 0 1-14 3" />
);
export const Copy = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Icon>
);
export const Download = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M12 4v12M6 12l6 6 6-6M4 20h16" />
);
export const Edit = ({ size = 16 }: IconProps) => (
  <Icon size={size} d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" />
);
export const PostIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 10h10M7 14h6" />
  </Icon>
);
export const ThreadIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="M6 8v8M10 6h10M10 10h7M10 14h9M10 18h6" />
  </Icon>
);
export const VideoIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </Icon>
);
export const CarouselIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="6" y="5" width="12" height="14" rx="2" />
    <path d="M3 8v8M21 8v8" />
  </Icon>
);
export const NotionIcon = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7v10M9 7l6 10M15 7v10" />
  </Icon>
);
export const Settings = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);
export const Mic = ({ size = 16 }: IconProps) => (
  <Icon size={size}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);
