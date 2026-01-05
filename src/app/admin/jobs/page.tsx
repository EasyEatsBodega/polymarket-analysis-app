"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface JobRun {
  id: string;
  jobName: string;
  status: "RUNNING" | "SUCCESS" | "FAIL";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  detailsJson: Record<string, unknown> | null;
}

export default function JobsPage() {
  const { isLoaded } = useUser();
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobRun | null>(null);

  useEffect(() => {
    async function loadJobs() {
      try {
        const response = await fetch("/api/admin/jobs");
        const data = await response.json();
        if (data.success) {
          setJobs(data.jobs);
        }
      } catch (error) {
        console.error("Failed to load jobs:", error);
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            Success
          </span>
        );
      case "FAIL":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            Failed
          </span>
        );
      case "RUNNING":
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full animate-pulse">
            Running
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  const formatDuration = (startedAt: string, finishedAt: string | null) => {
    if (!finishedAt) return "—";
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    const durationMs = end - start;

    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
    return `${(durationMs / 60000).toFixed(1)}m`;
  };

  const formatJobName = (name: string) => {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  if (!isLoaded || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/admin" className="hover:text-gunmetal">
              Admin
            </Link>
          </li>
          <li>/</li>
          <li className="text-gunmetal font-medium">Job History</li>
        </ol>
      </nav>

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gunmetal">Job History</h1>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 border border-dust-grey text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Job Table */}
      <div className="bg-white border border-dust-grey rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-dust-grey">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Job Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Started
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-dust-grey">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No job runs found. Run a job from the Admin Dashboard to see history.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gunmetal">
                      {formatJobName(job.jobName)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(job.startedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDuration(job.startedAt, job.finishedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="text-pine-blue hover:text-opacity-80 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-dust-grey flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gunmetal">
                {formatJobName(selectedJob.jobName)}
              </h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">{getStatusBadge(selectedJob.status)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Started At</dt>
                  <dd className="mt-1 text-sm text-gunmetal">
                    {new Date(selectedJob.startedAt).toLocaleString()}
                  </dd>
                </div>
                {selectedJob.finishedAt && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Finished At</dt>
                    <dd className="mt-1 text-sm text-gunmetal">
                      {new Date(selectedJob.finishedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Duration</dt>
                  <dd className="mt-1 text-sm text-gunmetal">
                    {formatDuration(selectedJob.startedAt, selectedJob.finishedAt)}
                  </dd>
                </div>
                {selectedJob.error && (
                  <div>
                    <dt className="text-sm font-medium text-red-500">Error</dt>
                    <dd className="mt-1 text-sm text-red-700 bg-red-50 p-3 rounded">
                      {selectedJob.error}
                    </dd>
                  </div>
                )}
                {selectedJob.detailsJson && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Details</dt>
                    <dd className="mt-1">
                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                        {JSON.stringify(selectedJob.detailsJson, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="px-6 py-4 border-t border-dust-grey">
              <button
                onClick={() => setSelectedJob(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
