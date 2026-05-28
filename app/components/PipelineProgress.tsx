"use client";

interface StepInfo {
  step: string;
  detail: string;
  done: boolean;
}

const STEP_ICONS: Record<string, string> = {
  "Locating your property": "📍",
  "Gathering property & market intelligence": "🔍",
  "Researching incentive programs": "💰",
  "Matching products to your profile": "🔧",
  "Writing your hyper-personalized proposal": "📄",
};

export function PipelineProgress({ steps }: { steps: StepInfo[] }) {
  const ALL_STEPS = [
    "Locating your property",
    "Gathering property & market intelligence",
    "Researching incentive programs",
    "Matching products to your profile",
    "Writing your hyper-personalized proposal",
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <h2 className="font-semibold text-gray-700">Running AI pipeline...</h2>
      <div className="space-y-3">
        {ALL_STEPS.map((stepName, i) => {
          const found = steps.find((s) => s.step === stepName);
          const currentIndex = steps.findIndex((s) => !s.done);
          const isActive = steps[currentIndex]?.step === stepName;
          const isDone = found?.done;
          const isPending = !found;

          return (
            <div key={stepName} className="flex items-start gap-3">
              {/* Status indicator */}
              <div
                className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                  isDone
                    ? "bg-ecosave-500 text-white"
                    : isActive
                    ? "bg-ecosave-100 border-2 border-ecosave-500"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone ? "✓" : isPending ? i + 1 : ""}
                {isActive && (
                  <span className="inline-block w-2 h-2 bg-ecosave-500 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <div
                  className={`text-sm font-medium ${
                    isDone
                      ? "text-ecosave-700"
                      : isActive
                      ? "text-gray-900"
                      : "text-gray-400"
                  }`}
                >
                  {STEP_ICONS[stepName] ?? ""} {stepName}
                </div>
                {found && (
                  <div className="text-xs text-gray-500 mt-0.5">{found.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
