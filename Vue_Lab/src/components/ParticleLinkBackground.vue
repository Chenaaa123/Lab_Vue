<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue'

const canvasRef = ref(null)

let rafId = 0
/** @type {{ x: number, y: number, vx: number, vy: number }[]} */
let particles = []
const mouse = { x: 0, y: 0, active: false }

const LINK_DIST = 118
const ATTRACT_R = 200
const ATTRACT_STR = 0.06
const MAX_SPEED = 0.95
const DAMP = 0.994
const JITTER = 0.018

let cssW = 0
let cssH = 0

function particleCountForSize(w, h) {
  return Math.min(130, Math.max(48, Math.floor((w * h) / 11000)))
}

function initParticles() {
  const w = cssW
  const h = cssH
  const n = particleCountForSize(w, h)
  particles = []
  for (let i = 0; i < n; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
    })
  }
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = window.innerWidth
  cssH = window.innerHeight
  canvas.width = Math.floor(cssW * dpr)
  canvas.height = Math.floor(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  initParticles()
}

function step() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = cssW
  const h = cssH

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  for (const p of particles) {
    if (mouse.active) {
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 > 4 && d2 < ATTRACT_R * ATTRACT_R) {
        const d = Math.sqrt(d2)
        p.vx += (dx / d) * ATTRACT_STR
        p.vy += (dy / d) * ATTRACT_STR
      }
    }

    p.vx += (Math.random() - 0.5) * JITTER
    p.vy += (Math.random() - 0.5) * JITTER
    p.vx *= DAMP
    p.vy *= DAMP

    const sp = Math.hypot(p.vx, p.vy)
    if (sp > MAX_SPEED) {
      p.vx = (p.vx / sp) * MAX_SPEED
      p.vy = (p.vy / sp) * MAX_SPEED
    }

    p.x += p.vx
    p.y += p.vy

    if (p.x < -2) p.x = w + 2
    if (p.x > w + 2) p.x = -2
    if (p.y < -2) p.y = h + 2
    if (p.y > h + 2) p.y = -2
  }

  const len = particles.length
  for (let i = 0; i < len; i++) {
    const a = particles[i]
    for (let j = i + 1; j < len; j++) {
      const b = particles[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < LINK_DIST && d > 0.5) {
        const t = 1 - d / LINK_DIST
        ctx.strokeStyle = `rgba(160, 220, 255, ${t * 0.42})`
        ctx.lineWidth = 0.85
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  for (const p of particles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.75, 0, Math.PI * 2)
    ctx.fill()
  }

  rafId = requestAnimationFrame(step)
}

function onMouseMove(e) {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.active = true
}

function onMouseLeave() {
  mouse.active = false
}

function onResize() {
  resize()
}

onMounted(async () => {
  await nextTick()
  resize()
  rafId = requestAnimationFrame(step)
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('mousemove', onMouseMove, { passive: true })
  window.addEventListener('mouseleave', onMouseLeave, { passive: true })
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseleave', onMouseLeave)
})
</script>

<template>
  <canvas ref="canvasRef" class="particle-bg" aria-hidden="true" />
</template>

<style scoped>
.particle-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: transparent;
}
</style>
