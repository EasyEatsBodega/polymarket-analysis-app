"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface AppConfig {
  momentumWeights: {
    rank: number;
    trends: number;
    wikipedia: number;
  };
  breakoutThreshold: number;
  forecastHorizonDays: number;
}

const DEFAULT_CONFIG: AppConfig = {
  momentumWeights: {
    rank: 33,
    trends: 33,
    wikipedia: 34,
  },
  breakoutThreshold: 60,
  forecastHorizonDays: 14,
};

export default function SettingsPage() {
  const { isLoaded } = useUser();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/config");
        const data = await response.json();
        if (data.success && data.config) {
          setConfig({
            momentumWeights: data.config.momentumWeights || DEFAULT_CONFIG.momentumWeights,
            breakoutThreshold: data.config.breakoutThreshold ?? DEFAULT_CONFIG.breakoutThreshold,
            forecastHorizonDays: data.config.forecastHorizonDays ?? DEFAULT_CONFIG.forecastHorizonDays,
          });
        }
      } catch (error) {
        console.error("Failed to load config:", error);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  const handleWeightChange = (key: keyof AppConfig["momentumWeights"], value: number) => {
    setConfig((prev) => ({
      ...prev,
      momentumWeights: {
        ...prev.momentumWeights,
        [key]: value,
      },
    }));
  };

  const handleSave = async () => {
    // Validate weights sum to 100
    const weightSum =
      config.momentumWeights.rank +
      config.momentumWeights.trends +
      config.momentumWeights.wikipedia;

    if (weightSum !== 100) {
      setMessage({
        type: "error",
        text: `Weights must sum to 100 (currently ${weightSum})`,
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Settings saved successfully!" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save settings" });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/admin" className="hover:text-gunmetal">
              Admin
            </Link>
          </li>
          <li>/</li>
          <li className="text-gunmetal font-medium">Settings</li>
        </ol>
      </nav>

      <h1 className="text-3xl font-bold text-gunmetal mb-8">Settings</h1>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Momentum Score Weights */}
      <section className="bg-white border border-dust-grey rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gunmetal mb-2">Momentum Score Weights</h2>
        <p className="text-gray-600 text-sm mb-6">
          Adjust the relative importance of each signal in the momentum score calculation.
          Weights must sum to 100%.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rank Change Weight: {config.momentumWeights.rank}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.momentumWeights.rank}
              onChange={(e) => handleWeightChange("rank", parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Weight for Netflix Top 10 rank improvements
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Trends Weight: {config.momentumWeights.trends}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.momentumWeights.trends}
              onChange={(e) => handleWeightChange("trends", parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Weight for Google Trends search interest
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wikipedia Weight: {config.momentumWeights.wikipedia}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.momentumWeights.wikipedia}
              onChange={(e) => handleWeightChange("wikipedia", parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-1">
              Weight for Wikipedia pageview activity
            </p>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-dust-grey">
            <span className="text-sm font-medium text-gray-700">Total:</span>
            <span
              className={`text-lg font-bold ${
                config.momentumWeights.rank +
                  config.momentumWeights.trends +
                  config.momentumWeights.wikipedia ===
                100
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {config.momentumWeights.rank +
                config.momentumWeights.trends +
                config.momentumWeights.wikipedia}
              %
            </span>
          </div>
        </div>
      </section>

      {/* Breakout Threshold */}
      <section className="bg-white border border-dust-grey rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gunmetal mb-2">Breakout Threshold</h2>
        <p className="text-gray-600 text-sm mb-6">
          Minimum momentum score required to be flagged as a breakout candidate.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Threshold: {config.breakoutThreshold}
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={config.breakoutThreshold}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                breakoutThreshold: parseInt(e.target.value),
              }))
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0 (show all)</span>
            <span>100 (very strict)</span>
          </div>
        </div>
      </section>

      {/* Forecast Horizon */}
      <section className="bg-white border border-dust-grey rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gunmetal mb-2">Forecast Settings</h2>
        <p className="text-gray-600 text-sm mb-6">
          Configure the forecasting model parameters.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Forecast Horizon: {config.forecastHorizonDays} days
          </label>
          <input
            type="range"
            min="7"
            max="30"
            value={config.forecastHorizonDays}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                forecastHorizonDays: parseInt(e.target.value),
              }))
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>7 days</span>
            <span>30 days</span>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <button
          onClick={() => setConfig(DEFAULT_CONFIG)}
          className="px-6 py-2 border border-dust-grey text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-pine-blue text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
