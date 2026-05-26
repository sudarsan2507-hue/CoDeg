import { Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Duel from "./pages/Duel.jsx";
import Result from "./pages/Result.jsx";

export default function App() {
  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">CoDeg</div>
        <nav className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/duel">Duel</Link>
          <Link to="/result">Result</Link>
        </nav>
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/duel" element={<Duel />} />
          <Route path="/result" element={<Result />} />
        </Routes>
      </main>
    </div>
  );
}
