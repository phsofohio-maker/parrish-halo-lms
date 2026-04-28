/**
 * SignatureCapture
 *
 * Two-mode e-signature capture: freehand canvas (with touch support) or
 * typed signature rendered in a cursive font. Both flow through a single
 * onChange so the parent can submit one payload regardless of method.
 *
 * @module components/SignatureCapture
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser, PenLine, Type } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../utils';
import type { SignatureMethod } from '../functions/src/types';

const MIN_STROKE_POINTS = 6;
const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 160;

export interface SignaturePayload {
  method: SignatureMethod;
  /** Base64 PNG (drawn) or the typed string (typed). */
  data: string;
  /** Captured at the moment the signature was completed, NOT at submit. */
  capturedAt: string;
}

interface SignatureCaptureProps {
  signerName: string;
  onChange: (payload: SignaturePayload | null) => void;
  disabled?: boolean;
}

export const SignatureCapture: React.FC<SignatureCaptureProps> = ({
  signerName, onChange, disabled,
}) => {
  const [method, setMethod] = useState<SignatureMethod>('drawn');
  const [typedValue, setTypedValue] = useState('');
  const [pointCount, setPointCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // -------- Canvas helpers --------
  const getCtx = (): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext('2d') : null;
  };

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setPointCount(0);
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    clearCanvas();
  }, [clearCanvas]);

  const eventToPoint = (
    e: React.MouseEvent | React.TouchEvent | React.PointerEvent
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return null;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const beginStroke = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    isDrawingRef.current = true;
    lastPointRef.current = eventToPoint(e);
  };

  const continueStroke = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = getCtx();
    const point = eventToPoint(e);
    if (!ctx || !point || !lastPointRef.current) return;

    ctx.strokeStyle = '#0d529d';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    setPointCount(c => c + 1);
  };

  const endStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pointCount < MIN_STROKE_POINTS) return; // not enough yet
    onChange({
      method: 'drawn',
      data: canvas.toDataURL('image/png'),
      capturedAt: new Date().toISOString(),
    });
  };

  // -------- Typed mode --------
  const handleTypedChange = (value: string) => {
    setTypedValue(value);
    if (value.trim().length === 0) {
      onChange(null);
      return;
    }
    onChange({
      method: 'typed',
      data: value.trim(),
      capturedAt: new Date().toISOString(),
    });
  };

  const switchMethod = (next: SignatureMethod) => {
    setMethod(next);
    onChange(null);
    if (next === 'drawn') {
      setTypedValue('');
      // Defer clear until after canvas re-mounts.
      setTimeout(clearCanvas, 0);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Method tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => switchMethod('drawn')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
            method === 'drawn'
              ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <PenLine className="h-4 w-4" /> Draw signature
        </button>
        <button
          type="button"
          onClick={() => switchMethod('typed')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
            method === 'typed'
              ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Type className="h-4 w-4" /> Type signature
        </button>
      </div>

      <div className="p-4">
        {method === 'drawn' ? (
          <>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className={cn(
                'w-full bg-white border border-dashed border-gray-300 rounded-md touch-none',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'
              )}
              onMouseDown={beginStroke}
              onMouseMove={continueStroke}
              onMouseUp={endStroke}
              onMouseLeave={endStroke}
              onTouchStart={beginStroke}
              onTouchMove={continueStroke}
              onTouchEnd={endStroke}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-gray-400">
                {pointCount < MIN_STROKE_POINTS
                  ? 'Draw your signature above (the Sign button enables once you have a complete mark).'
                  : 'Signature captured.'}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCanvas}
                disabled={disabled || pointCount === 0}
                className="gap-1.5"
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </>
        ) : (
          <>
            <input
              type="text"
              value={typedValue}
              placeholder={`Type your full legal name (e.g., ${signerName || 'Jane Doe'})`}
              onChange={e => handleTypedChange(e.target.value)}
              disabled={disabled}
              className="w-full h-11 px-3 text-base border border-gray-200 rounded-md focus:border-primary-500 focus:outline-none"
            />
            {typedValue.trim() && (
              <div className="mt-3 px-4 py-3 border border-gray-200 rounded-md bg-gray-50">
                <p
                  className="text-2xl text-navy-700"
                  style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive' }}
                >
                  {typedValue.trim()}
                </p>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-2">
              Your typed name above is the legally binding signature for this acknowledgment.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
