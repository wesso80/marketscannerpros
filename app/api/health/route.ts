/**
 * Health Check API Endpoint
 * 
 * @route GET /api/health
 * @description Returns system health status and version info
 * @access Public
 * 
 * @returns {object} Health status with timestamp
 * 
 * @example
 * GET /api/health
 * Response: { status: "healthy", timestamp: "2025-12-14T...", service: "marketing-site", version: "1.0.0" }
 */

import { NextResponse } from "next/server";

export const runtime = 'edge'; // Use edge runtime for faster response

export function GET() {
  const health = {
    status: 'healthy',
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'marketscanner-marketing-site',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'unknown',
  };

  return NextResponse.json(health, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}