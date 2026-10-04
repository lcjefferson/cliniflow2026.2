import React from "react";
import { User } from "lucide-react";
import { CHANNEL_META, getInitials } from "../lib/contact";

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
};

export default function ContactAvatar({ name, seed, channel, size = "md", tone: toneOverride }) {
  let hash = 0;
  for (const ch of String(seed || name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = toneOverride || AVATAR_TONES[hash % AVATAR_TONES.length];
  const initials = getInitials(name);
  const channelMeta = CHANNEL_META[channel];
  return (
    <div className="relative flex-shrink-0">
      <div className={`flex items-center justify-center rounded-full font-semibold ${SIZES[size] || SIZES.md} ${tone}`}>
        {initials || <User className="h-1/2 w-1/2" />}
      </div>
      {channelMeta && (
        <span
          title={channelMeta.label}
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${channelMeta.dot}`}
        />
      )}
    </div>
  );
}
