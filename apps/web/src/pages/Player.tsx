import type { PlaybackTokenResponse } from "@accessibooks/shared";

export default function Player() {
  const mockToken: PlaybackTokenResponse = {
    token: "",
    expiresAt: 0,
    contentId: "",
    userId: "",
    allowedFormats: ["mp3", "aac"],
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Player</h1>
      <p className="text-gray-600">
        DRM-protected playback will be implemented here.
      </p>
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">
          Supported formats: {mockToken.allowedFormats.join(", ")}
        </p>
      </div>
    </div>
  );
}
