"use client"

import Image from "next/image"
import { useState } from "react"

interface TeamCrestProps {
  crestUrl?: string | null
  teamName: string
  size?: number
  className?: string
}

export default function TeamCrest({
  crestUrl,
  teamName,
  size = 24,
  className = "",
}: TeamCrestProps) {
  const [error, setError] = useState(false)

  if (!crestUrl || error) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-slate-600 rounded-full text-xs font-bold text-white ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
        title={teamName}
      >
        {teamName.substring(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <Image
      src={crestUrl}
      alt={teamName}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={() => setError(true)}
    />
  )
}
