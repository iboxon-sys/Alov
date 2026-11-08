import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  opacity: number;
  color: string;
  pulseSpeed: number;
  pulsePhase: number;
}

export const AmbientParticlesBackground: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Warm, elegant ambient colors (Alov brand palette: warm rose, gold, soft coral, blush)
    const particleColors = [
      'rgba(232, 71, 74, 0.45)',  // Alov crimson
      'rgba(251, 146, 60, 0.4)',  // Warm amber
      'rgba(244, 114, 182, 0.4)', // Soft rose
      'rgba(253, 186, 116, 0.35)', // Peach gold
      'rgba(254, 205, 211, 0.5)', // Gentle blush
    ];

    const particleCount = Math.min(35, Math.floor(width / 40));
    const particles: Particle[] = [];

    const createParticle = (startY?: number): Particle => {
      const radius = Math.random() * 4 + 2; // 2px to 6px soft bokeh
      return {
        x: Math.random() * width,
        y: startY !== undefined ? startY : Math.random() * height,
        radius,
        speedY: -(Math.random() * 0.45 + 0.25), // gentle upward floating
        speedX: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.4 + 0.3,
        color: particleColors[Math.floor(Math.random() * particleColors.length)],
        pulseSpeed: Math.random() * 0.02 + 0.01,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    };

    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle());
    }

    let mouseInfluence = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = width / 2;
      mouseInfluence = ((e.clientX - centerX) / centerX) * 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    let time = 0;
    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.pulsePhase += p.pulseSpeed;
        const currentOpacity = p.opacity + Math.sin(p.pulsePhase) * 0.15;
        const sway = Math.sin(time + i * 0.7) * 0.5 + mouseInfluence;

        p.x += p.speedX + sway;
        p.y += p.speedY;

        // Wrap around borders smoothly
        if (p.y < -20) {
          particles[i] = createParticle(height + 15);
        }
        if (p.x > width + 20) {
          p.x = -20;
        } else if (p.x < -20) {
          p.x = width + 20;
        }

        // Draw soft glowing ambient particle
        ctx.save();
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
        gradient.addColorStop(0, p.color);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = Math.max(0.1, Math.min(0.8, currentOpacity));
        ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-10 ${className}`}
      style={{ willChange: 'transform' }}
      aria-hidden="true"
    />
  );
};
