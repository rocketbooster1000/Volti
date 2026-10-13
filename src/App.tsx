import { useState } from "react";
import { LibraryScreen } from "./components/LibraryScreen.tsx";
import { ReaderScreen } from "./components/ReaderScreen.tsx";
import type { LibraryScore } from "./types.ts";

type Screen = { name: "library" } | { name: "reader"; score: LibraryScore };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "library" });
  const [libraryGeneration, setLibraryGeneration] = useState(0);

  if (screen.name === "reader") {
    return (
      <ReaderScreen
        score={screen.score}
        onClose={() => {
          setScreen({ name: "library" });
          setLibraryGeneration((generation) => generation + 1);
        }}
      />
    );
  }

  return (
    <LibraryScreen
      key={libraryGeneration}
      onOpen={(score) => setScreen({ name: "reader", score })}
    />
  );
}
