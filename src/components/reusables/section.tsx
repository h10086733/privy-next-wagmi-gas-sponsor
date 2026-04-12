import React from "react";

interface Action {
  name: string;
  function: () => void;
  disabled?: boolean;
}

interface SectionProps {
  name: string;
  description?: string;
  filepath?: string;
  actions: Action[];
  children?: React.ReactNode;
}

export default function Section({
  name,
  description,
  filepath,
  actions,
  children,
}: SectionProps) {
  return (
    <section className="card p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">{name}</h2>
          {description ? <p className="max-w-3xl text-sm leading-6 text-gray-600">{description}</p> : null}
          {filepath ? <p className="text-xs text-gray-400">{filepath}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.name}
              className={action.name.includes("Submit") ? "button-primary" : "button-secondary"}
              disabled={action.disabled}
              onClick={action.function}
            >
              {action.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}
