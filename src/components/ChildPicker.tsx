// src/components/ChildPicker.tsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

// Dummy list—replace with real data later
const kids = [
  { id: "a1", name: "Alice", avatar: "/avatars/alice.jpg" },
  { id: "b2", name: "Ben",   avatar: "/avatars/ben.jpg" },
  { id: "c3", name: "Cara",  avatar: "/avatars/cara.jpg" },
  // …etc
];

export default function ChildPicker() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="overflow-x-auto py-2 border-b bg-white shadow-card">
      <div className="flex gap-4 px-4">
        {kids.map((kid) => {
          const isActive = pathname.includes(kid.id);
          return (
            <button
              key={kid.id}
              onClick={() => nav(`/myschool/student/${kid.id}`)}
              className={`flex-shrink-0 flex flex-col items-center space-y-1
                ${isActive ? "ring-2 ring-primary-500" : ""}`}
            >
              <img
                src={kid.avatar}
                alt={kid.name}
                className="w-12 h-12 rounded-full object-cover"
              />
              <span className="text-sm text-neutral-700">{kid.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
