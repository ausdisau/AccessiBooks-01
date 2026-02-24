import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Welcome to AccessiBooks</h1>
      <p className="text-lg text-gray-600">
        An accessible audiobook player and library built for everyone.
      </p>
      <Link
        to="/player"
        className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
      >
        Open Player
      </Link>
    </div>
  );
}
