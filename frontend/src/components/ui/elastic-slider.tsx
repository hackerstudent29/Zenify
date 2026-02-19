import {
    animate,
    motion,
    useMotionValue,
    useMotionValueEvent,
    useTransform,
} from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const MAX_OVERFLOW = 50

export default function ElasticSlider({
    defaultValue = 50,
    startingValue = 0,
    maxValue = 100,
    className = '',
    isStepped = false,
    stepSize = 1,
    leftIcon,
    rightIcon,
    onChange,
}: {
    defaultValue?: number
    startingValue?: number
    maxValue?: number
    className?: string
    isStepped?: boolean
    stepSize?: number
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    onChange?: (value: number) => void
}) {
    return (
        <div
            className={`flex flex-col items-center justify-center gap-4 ${className}`}
        >
            <Slider
                defaultValue={defaultValue}
                startingValue={startingValue}
                maxValue={maxValue}
                isStepped={isStepped}
                stepSize={stepSize}
                leftIcon={leftIcon}
                rightIcon={rightIcon}
                onChange={onChange}
            />
        </div>
    )
}

function Slider({
    defaultValue,
    startingValue,
    maxValue,
    isStepped,
    stepSize,
    leftIcon,
    rightIcon,
    onChange,
}: {
    defaultValue: number
    startingValue: number
    maxValue: number
    isStepped: boolean
    stepSize: number
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    onChange?: (value: number) => void
}) {
    const [value, setValue] = useState(defaultValue)
    const sliderRef = useRef<HTMLDivElement>(null)
    const [region, setRegion] = useState('middle')
    const clientX = useMotionValue(0)
    const overflow = useMotionValue(0)
    const scale = useMotionValue(1)

    useMotionValueEvent(clientX, 'change', (latest) => {
        if (sliderRef.current) {
            const { left, right } = sliderRef.current.getBoundingClientRect()
            let newValue

            if (latest < left) {
                setRegion('left')
                newValue = left - latest
            } else if (latest > right) {
                setRegion('right')
                newValue = latest - right
            } else {
                setRegion('middle')
                newValue = 0
            }

            overflow.jump(newValue)
        }
    })

    useEffect(() => {
        if (region === 'left' || region === 'right') {
            animate(scale, 1.25, { type: 'spring', duration: 0.4 })
        } else {
            animate(scale, 1, { type: 'spring', duration: 0.4 })
        }
    }, [region, scale])

    return (
        <motion.div
            ref={sliderRef}
            onPointerMove={(e) => clientX.set(e.clientX)}
            onPointerLeave={() => {
                clientX.set(0)
                overflow.jump(0)
                scale.jump(1)
            }}
            className="group/slider relative flex w-full max-w-[200px] cursor-grab items-center justify-center touch-none active:cursor-grabbing"
        >
            <div className="absolute left-[-24px] top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-50">
                {leftIcon}
            </div>
            <div className="absolute right-[-24px] top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300 group-hover/slider:opacity-50">
                {rightIcon}
            </div>

            <motion.div
                style={{
                    scale,
                    opacity: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0]),
                }}
                className="flex w-full items-center justify-center py-4 relative"
            >
                <div className="absolute left-0 right-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full overflow-hidden bg-white/10">
                    <motion.div
                        className="absolute left-0 top-0 bottom-0 bg-white"
                        style={{ width: `${(value / maxValue) * 100}%` }}
                    />
                </div>

                <input
                    type="range"
                    min={startingValue}
                    max={maxValue}
                    value={value}
                    step={isStepped ? stepSize : undefined}
                    onChange={(e) => {
                        const newVal = parseInt(e.target.value)
                        setValue(newVal)
                        onChange?.(newVal)
                    }}
                    className="relative z-10 w-full opacity-0 cursor-pointer"
                />
            </motion.div>
        </motion.div>
    )
}
