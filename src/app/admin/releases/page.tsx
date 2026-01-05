"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

type TitleType = "SHOW" | "MOVIE";
type CandidateStatus = "PENDING" | "MATCHED" | "REJECTED" | "RELEASED";

interface ReleaseCandidate {
  id: string;
  name: string;
  type: TitleType;
  releaseDate: string | null;
  source: string;
  status: CandidateStatus;
  titleId: string | null;
  title: {
    id: string;
    name: string;
    type: TitleType;
  } | null;
  createdAt: string;
}

interface Title {
  id: string;
  canonicalName: string;
  type: TitleType;
}

function StatusBadge({ status }: { status: CandidateStatus }) {
  const colors: Record<CandidateStatus, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    MATCHED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    RELEASED: "bg-blue-100 text-blue-800",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

export default function ReleasesPage() {
  const { isLoaded: userLoaded } = useUser();
  const [releases, setReleases] = useState<ReleaseCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<TitleType | "">("");

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRelease, setNewRelease] = useState({
    name: "",
    type: "SHOW" as TitleType,
    releaseDate: "",
  });
  const [adding, setAdding] = useState(false);

  // Match modal state
  const [matchingRelease, setMatchingRelease] = useState<ReleaseCandidate | null>(null);
  const [titleSearch, setTitleSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Title[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);

      const response = await fetch(`/api/releases?${params}`);
      const data = await response.json();

      if (data.success) {
        setReleases(data.data);
      } else {
        setError(data.error || "Failed to fetch releases");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, [statusFilter, typeFilter]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    try {
      const response = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRelease),
      });
      const data = await response.json();

      if (data.success) {
        setNewRelease({ name: "", type: "SHOW", releaseDate: "" });
        setShowAddForm(false);
        fetchReleases();
      } else {
        alert(data.error || "Failed to add release");
      }
    } catch (err) {
      alert("Failed to add release");
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (id: string, status: CandidateStatus) => {
    try {
      const response = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();

      if (data.success) {
        fetchReleases();
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this release?")) return;

    try {
      const response = await fetch(`/api/releases/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        fetchReleases();
      } else {
        alert(data.error || "Failed to delete release");
      }
    } catch (err) {
      alert("Failed to delete release");
    }
  };

  const searchTitles = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/titles?search=${encodeURIComponent(query)}&limit=10`);
      const data = await response.json();
      if (data.success) {
        setSearchResults(data.data || []);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleMatch = async (titleId: string) => {
    if (!matchingRelease) return;

    try {
      const response = await fetch(`/api/releases/${matchingRelease.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const data = await response.json();

      if (data.success) {
        setMatchingRelease(null);
        setTitleSearch("");
        setSearchResults([]);
        fetchReleases();
      } else {
        alert(data.error || "Failed to match release");
      }
    } catch (err) {
      alert("Failed to match release");
    }
  };

  const handlePinToWatchlist = async (titleId: string) => {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const data = await response.json();

      if (data.success) {
        alert("Added to watchlist!");
      } else {
        alert(data.error || "Failed to add to watchlist");
      }
    } catch (err) {
      alert("Failed to add to watchlist");
    }
  };

  if (!userLoaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center space-x-2 text-sm text-gray-500">
          <li>
            <Link href="/admin" className="hover:text-gunmetal">
              Admin
            </Link>
          </li>
          <li>/</li>
          <li className="text-gunmetal font-medium">Releases</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gunmetal">Release Watchlist</h1>
          <p className="text-gray-600 mt-1">
            Track upcoming Netflix releases before they hit the Top 10
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add Release"}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white border border-dust-grey rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gunmetal mb-4">Add New Release</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title Name
              </label>
              <input
                type="text"
                value={newRelease.name}
                onChange={(e) => setNewRelease({ ...newRelease, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="e.g., Stranger Things Season 5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={newRelease.type}
                onChange={(e) => setNewRelease({ ...newRelease, type: e.target.value as TitleType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="SHOW">TV Show</option>
                <option value="MOVIE">Movie</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Release Date (optional)
              </label>
              <input
                type="date"
                value={newRelease.releaseDate}
                onChange={(e) => setNewRelease({ ...newRelease, releaseDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={adding}
                className="w-full bg-gunmetal text-white px-4 py-2 rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add Release"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | "")}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="MATCHED">Matched</option>
            <option value="REJECTED">Rejected</option>
            <option value="RELEASED">Released</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TitleType | "")}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Types</option>
            <option value="SHOW">TV Shows</option>
            <option value="MOVIE">Movies</option>
          </select>
        </div>
      </div>

      {/* Releases Table */}
      {loading ? (
        <div className="bg-white border border-dust-grey rounded-lg p-8 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      ) : releases.length === 0 ? (
        <div className="bg-dust-grey bg-opacity-20 rounded-lg p-8 text-center">
          <p className="text-gray-500">No release candidates found.</p>
          <p className="text-sm text-gray-400 mt-2">
            Add releases manually or wait for the discovery job to run.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-dust-grey rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Release Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Linked Title
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {releases.map((release) => (
                <tr key={release.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gunmetal">{release.name}</div>
                    <div className="text-xs text-gray-500">Source: {release.source}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {release.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {release.releaseDate
                      ? new Date(release.releaseDate).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={release.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {release.title ? (
                      <span className="text-green-600">{release.title.name}</span>
                    ) : (
                      <span className="text-gray-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {release.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => setMatchingRelease(release)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Match
                          </button>
                          <button
                            onClick={() => handleStatusChange(release.id, "REJECTED")}
                            className="text-red-600 hover:text-red-800"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {release.status === "MATCHED" && release.titleId && (
                        <button
                          onClick={() => handlePinToWatchlist(release.titleId!)}
                          className="text-green-600 hover:text-green-800"
                        >
                          Pin
                        </button>
                      )}
                      {release.status === "REJECTED" && (
                        <button
                          onClick={() => handleStatusChange(release.id, "PENDING")}
                          className="text-yellow-600 hover:text-yellow-800"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(release.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Match Modal */}
      {matchingRelease && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h2 className="text-xl font-semibold text-gunmetal mb-4">
              Match "{matchingRelease.name}"
            </h2>
            <p className="text-gray-600 mb-4">
              Search for an existing title to link this release candidate to.
            </p>

            <input
              type="text"
              value={titleSearch}
              onChange={(e) => {
                setTitleSearch(e.target.value);
                searchTitles(e.target.value);
              }}
              placeholder="Search titles..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            {searching && (
              <p className="text-gray-500 text-sm mb-4">Searching...</p>
            )}

            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg mb-4">
                {searchResults.map((title) => (
                  <button
                    key={title.id}
                    onClick={() => handleMatch(title.id)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                  >
                    <div className="font-medium text-gunmetal">
                      {title.canonicalName}
                    </div>
                    <div className="text-xs text-gray-500">{title.type}</div>
                  </button>
                ))}
              </div>
            )}

            {titleSearch.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-gray-500 text-sm mb-4">
                No titles found. The title may need to be created first.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setMatchingRelease(null);
                  setTitleSearch("");
                  setSearchResults([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
