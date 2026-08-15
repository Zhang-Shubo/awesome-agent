import { useEffect, useRef, useState } from 'react'

// 桌宠:petdex.dev 的 boba(MIT,Codex sprite v2 格式,8x11 网格)。
// 雪碧图已缩到半尺寸,每格 96x104;换宠物 = 替换 public/pet/spritesheet.webp(同格式即可)。
const CW = 96, CH = 104
const STATES = {
  idle:  { row: 0, frames: 6, ms: 1100 },
  right: { row: 1, frames: 8, ms: 1060 },
  left:  { row: 2, frames: 8, ms: 1060 },
  wave:  { row: 3, frames: 4, ms: 700 },
  jump:  { row: 4, frames: 5, ms: 840 },
  wait:  { row: 6, frames: 6, ms: 1010 },
}
const SPEED = 55            // px/s
const W = 70                // 展示宽度(96 * 0.73)

export default function Pet() {
  const [ok, setOk] = useState(false)
  const box = useRef(null)
  const spr = useRef(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setOk(true)
    img.src = '/pet/spritesheet.webp'
  }, [])

  useEffect(() => {
    if (!ok) return
    let x = Math.random() * Math.max(0, innerWidth - W)
    let state = 'idle', frame = 0, target = x, oneShot = null
    let frameTimer, behaveTimer

    const draw = () => {
      spr.current.style.backgroundPosition = `-${frame * CW}px -${STATES[state].row * CH}px`
      box.current.style.transform = `translate3d(${x}px,0,0)`
    }
    const setState = (s) => {
      state = s; frame = 0
      clearInterval(frameTimer)
      frameTimer = setInterval(() => {
        frame += 1
        if (frame >= STATES[state].frames) {
          frame = 0
          if (oneShot) { const done = oneShot; oneShot = null; done() }
        }
        draw()
      }, STATES[s].ms / STATES[s].frames)
      draw()
    }
    // 随机行为:走去某处 / 发呆 / 等待 / 挥手
    const behave = () => {
      clearTimeout(behaveTimer)
      const r = Math.random()
      if (r < 0.45) {
        target = Math.random() * Math.max(0, innerWidth - W)
        setState(target > x ? 'right' : 'left')
      } else {
        setState(r < 0.75 ? 'idle' : r < 0.9 ? 'wait' : 'wave')
        behaveTimer = setTimeout(behave, 1800 + Math.random() * 3500)
      }
    }
    const mover = setInterval(() => {
      if (state !== 'left' && state !== 'right') return
      const step = (SPEED / 25) * (state === 'right' ? 1 : -1)
      x += step
      if ((state === 'right' && x >= target) || (state === 'left' && x <= target)) {
        x = target; behave()
      }
      draw()
    }, 40)
    // 点它:跳一下
    const el = box.current
    const jump = () => { if (state !== 'jump') { oneShot = behave; setState('jump') } }
    el.addEventListener('click', jump)

    behave()
    return () => {
      clearInterval(frameTimer); clearInterval(mover); clearTimeout(behaveTimer)
      el.removeEventListener('click', jump)
    }
  }, [ok])

  if (!ok) return null
  return (
    <div className="pet" ref={box} title="boba · 点我">
      <i ref={spr} />
    </div>
  )
}
