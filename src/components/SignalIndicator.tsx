"use client";

export type Signal = "BUY" | "HOLD" | "AVOID";
export type SignalStrength = "strong" | "moderate" | "weak";

interface SignalIndicatorProps {
  signal: Signal;
  strength?: SignalStrength;
  size?: "sm" | "md" | "lg";
}

const signalConfig = {
  BUY: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-300",
    label: "BUY",
  },
  HOLD: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
    label: "HOLD",
  },
  AVOID: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-300",
    label: "AVOID",
  },
};

const sizeConfig = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base",
};

export default function SignalIndicator({
  signal,
  strength = "moderate",
  size = "md",
}: SignalIndicatorProps) {
  const config = signalConfig[signal];
  const sizeClass = sizeConfig[size];

  // Add pulse animation for strong signals
  const pulseClass = strength === "strong" ? "animate-pulse" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${config.bg} ${config.text} ${config.border} ${sizeClass} ${pulseClass}`}
    >
      {signal === "BUY" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      )}
      {signal === "AVOID" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      )}
      {signal === "HOLD" && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      )}
      {config.label}
    </span>
  );
}
