"use client";

import { Check, Loader2, MapPin, Database, Tag, Layers, FileText } from "lucide-react";

interface StepInfo {
  step: string;
  detail: string;
  done: boolean;
}

const ALL_STEPS = [
  { label: "Locating property",                   Icon: MapPin   },
  { label: "Gathering property & market data",     Icon: Database },
  { label: "Researching incentive programs",       Icon: Tag      },
  { label: "Matching products to profile",         Icon: Layers   },
  { label: "Writing personalized proposal",        Icon: FileText },
];

// Normalize incoming step names to our canonical labels
const STEP_MAP: Record<string, string> = {
  "Locating your property":                       "Locating property",
  "Gathering property & market intelligence":     "Gathering property & market data",
  "Researching incentive programs":               "Researching incentive programs",
  "Matching products to your profile":            "Matching products to profile",
  "Writing your hyper-personalized proposal":     "Writing personalized proposal",
};

export function PipelineProgress({ steps }: { steps: StepInfo[] }) {
  const normalized = steps.map((s) => ({
    ...s,
    step: STEP_MAP[s.step] ?? s.step,
  }));

  return (
    <div className="border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Pipeline Running
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {ALL_STEPS.map(({ label, Icon }, i) => {
          const found = normalized.find((s) => s.step === label);
          const activeIdx = normalized.findIndex((s) => !s.done);
          const isActive = normalized[activeIdx]?.step === label;
          const isDone = found?.done === true;
          const isPending = !found;

          return (
            <div key={label} className={`flex items-start gap-4 px-6 py-4 ${isActive ? "bg-gray-50" : ""}`}>
              {/* Status */}
              <div className="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isDone ? (
                  <Check size={14} className="text-green-600" strokeWidth={2.5} />
                ) : isActive ? (
                  <Loader2 size={14} className="text-green-700 animate-spin" />
                ) : (
                  <span className="w-1.5 h-1.5 bg-gray-300 inline-block"></span>
                )}
              </div>

              {/* Icon + text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon
                    size={13}
                    className={isDone ? "text-green-600" : isActive ? "text-gray-700" : "text-gray-300"}
                    strokeWidth={1.75}
                  />
                  <span
                    className={`text-sm font-medium ${
                      isDone ? "text-gray-500" : isActive ? "text-gray-900" : "text-gray-300"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {found && (
                  <p className="text-xs text-gray-400 mt-0.5 pl-5 leading-relaxed">{found.detail}</p>
                )}
              </div>

              {/* Step number */}
              <span className={`text-xs tabular-nums ${isPending ? "text-gray-200" : "text-gray-400"}`}>
                0{i + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
