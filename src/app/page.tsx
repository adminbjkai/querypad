"use client";

import dynamic from "next/dynamic";
import Splash from "@/components/workspace/Splash";

const Workspace = dynamic(() => import("@/components/workspace/Workspace"), {
  ssr: false,
  loading: () => <Splash message="Loading QueryPad" />,
});

export default function Home() {
  return <Workspace />;
}
