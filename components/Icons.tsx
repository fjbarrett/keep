type IconProps = { className?: string };

export const PinIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 17v5" />
    <path d="M9 3h6l-1 4 3 3v3H7v-3l3-3-1-4z" />
  </svg>
);

export const PinFilledIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M9 3h6l-1 4 3 3v3H7v-3l3-3-1-4z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M12 13v9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const ArchiveIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="4" width="18" height="4" />
    <path d="M4 8v12h16V8" />
    <path d="M10 12h4" />
  </svg>
);

export const UnarchiveIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="4" width="18" height="4" />
    <path d="M4 8v12h16V8" />
    <path d="M12 18v-6" />
    <path d="M9 15l3-3 3 3" />
  </svg>
);

export const TrashIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 7h16" />
    <path d="M10 4h4l1 3h-6l1-3z" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const PaletteIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1-1-2 1-2 3-2h2a4 4 0 0 0 4-4c0-5-4-8-10-8z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="11" cy="7.5" r="1" />
    <circle cx="15.5" cy="8" r="1" />
    <circle cx="17.5" cy="12" r="1" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={className}
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);

export const DownloadIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 4v11" />
    <path d="M8 11l4 4 4-4" />
    <path d="M5 20h14" />
  </svg>
);

export const XIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    className={className}
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="5" y="11" width="14" height="9" rx="1" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const StackIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 7l8-4 8 4-8 4-8-4z" />
    <path d="M4 12l8 4 8-4" />
    <path d="M4 17l8 4 8-4" />
  </svg>
);
