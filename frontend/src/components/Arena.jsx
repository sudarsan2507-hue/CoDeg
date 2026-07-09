import { useEffect, useRef, useState } from "react";

const ANIM_BY_STYLE = {
  rapid: "anim-rapid",
  heavy: "anim-heavy",
  normal: "anim-attack",
  miss: "anim-miss"
};

// CSS-animated duel stage. `event` is the latest combat event (with a unique
// seq); the attacker lunges, the target shakes, damage floats up.
export default function Arena({ youName, oppName, event }) {
  const [anims, setAnims] = useState({ left: "", right: "" });
  const [floats, setFloats] = useState([]);
  const floatId = useRef(0);

  useEffect(() => {
    if (!event) return;
    const attackerSide = event.attackerId === event.youId ? "left" : "right";
    const targetSide = attackerSide === "left" ? "right" : "left";
    const timers = [];

    if (event.style === "miss") {
      setAnims({ [attackerSide]: ANIM_BY_STYLE.miss, [targetSide]: "" });
      addFloat(attackerSide, "MISS", "miss");
    } else {
      setAnims({ [attackerSide]: ANIM_BY_STYLE[event.style] || ANIM_BY_STYLE.normal, [targetSide]: "" });
      timers.push(
        setTimeout(() => {
          setAnims((a) => ({ ...a, [targetSide]: "anim-hit" }));
          addFloat(targetSide, `-${event.damage}`, "dmg");
          if (event.defense) addFloat(targetSide, `🛡 ${Math.round(event.defense * 100)}%`, "shield");
        }, 260)
      );
    }
    timers.push(setTimeout(() => setAnims({ left: "", right: "" }), 1100));
    return () => timers.forEach(clearTimeout);

    function addFloat(side, text, kind) {
      const id = ++floatId.current;
      setFloats((f) => [...f, { id, side, text, kind }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
    }
  }, [event]);

  return (
    <div className="arena-stage">
      <div className="fighter-slot">
        <div className={`fighter left ${anims.left || ""}`}>🤺</div>
        <span className="fighter-name">{youName}</span>
      </div>
      <div className="vs">VS</div>
      <div className="fighter-slot">
        <div className={`fighter right ${anims.right || ""}`}>🥷</div>
        <span className="fighter-name">{oppName}</span>
      </div>
      {floats.map((f) => (
        <span key={f.id} className={`float ${f.kind} ${f.side}`}>
          {f.text}
        </span>
      ))}
    </div>
  );
}
