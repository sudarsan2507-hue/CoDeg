import Editor from "@monaco-editor/react";
import { Link } from "react-router-dom";

const starterCode = `function solve(input) {
  // write your solution here
  return input;
}
`;

export default function Duel() {
  return (
    <section className="duel">
      <div className="panel">
        <h2>Problem Statement</h2>
        <p>
          Given an input string, return the same string. This placeholder will
          be replaced with real problems later.
        </p>
      </div>

      <div className="panel editor-panel">
        <Editor
          height="320px"
          defaultLanguage="javascript"
          defaultValue={starterCode}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false
          }}
        />
      </div>

      <div className="panel hp-panel">
        <div className="hp">
          <span>Player HP</span>
          <div className="hp-bar">
            <div className="hp-fill player" />
          </div>
        </div>
        <div className="hp">
          <span>Enemy HP</span>
          <div className="hp-bar">
            <div className="hp-fill enemy" />
          </div>
        </div>
      </div>

      <div className="panel arena">
        <div className="stickman">🤺</div>
        <div className="vs">VS</div>
        <div className="stickman">🥷</div>
      </div>

      <div className="actions duel-actions">
        <button className="button primary" type="button">
          Submit
        </button>
        <Link className="button ghost" to="/result">
          View Result
        </Link>
      </div>
    </section>
  );
}
