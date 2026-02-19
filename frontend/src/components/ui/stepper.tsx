import React, { Children, useState, useRef, useLayoutEffect, ReactNode } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import './stepper.css';

interface StepperProps {
    children: ReactNode;
    initialStep?: number;
    onStepChange?: (step: number) => void;
    onFinalStepCompleted?: () => void;
    stepCircleContainerClassName?: string;
    stepContainerClassName?: string;
    contentClassName?: string;
    footerClassName?: string;
    backButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    nextButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
    backButtonText?: string;
    nextButtonText?: string;
    disableStepIndicators?: boolean;
    renderStepIndicator?: (args: {
        step: number;
        currentStep: number;
        onStepClick: (step: number) => void;
    }) => ReactNode;
    [key: string]: any;
}

export default function Stepper({
    children,
    initialStep = 1,
    onStepChange = () => { },
    onFinalStepCompleted = () => { },
    stepCircleContainerClassName = '',
    stepContainerClassName = '',
    contentClassName = '',
    footerClassName = '',
    backButtonProps = {},
    nextButtonProps = {},
    backButtonText = 'Back',
    nextButtonText = 'Continue',
    disableStepIndicators = false,
    renderStepIndicator,
    ...rest
}: StepperProps) {
    const [currentStep, setCurrentStep] = useState(initialStep);
    const [direction, setDirection] = useState(0);
    const stepsArray = Children.toArray(children);
    const totalSteps = stepsArray.length;
    const isCompleted = currentStep > totalSteps;
    const isLastStep = currentStep === totalSteps;

    const updateStep = (newStep: number) => {
        setCurrentStep(newStep);
        if (newStep > totalSteps) {
            onFinalStepCompleted();
        } else {
            onStepChange(newStep);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setDirection(-1);
            updateStep(currentStep - 1);
        }
    };

    const handleNext = () => {
        if (!isLastStep) {
            setDirection(1);
            updateStep(currentStep + 1);
        }
    };

    const handleComplete = () => {
        setDirection(1);
        updateStep(totalSteps + 1);
    };

    return (
        <div className="outer-container" {...rest}>
            <div className={`step-circle-container ${stepCircleContainerClassName}`}>
                <div className={`step-indicator-row ${stepContainerClassName}`}>
                    {stepsArray.map((_, index) => {
                        const stepNumber = index + 1;
                        const isNotLastStep = index < totalSteps - 1;
                        return (
                            <React.Fragment key={stepNumber}>
                                {renderStepIndicator ? (
                                    renderStepIndicator({
                                        step: stepNumber,
                                        currentStep,
                                        onStepClick: (clicked) => {
                                            setDirection(clicked > currentStep ? 1 : -1);
                                            updateStep(clicked);
                                        }
                                    })
                                ) : (
                                    <StepIndicator
                                        step={stepNumber}
                                        disableStepIndicators={disableStepIndicators}
                                        currentStep={currentStep}
                                        onClickStep={(clicked) => {
                                            setDirection(clicked > currentStep ? 1 : -1);
                                            updateStep(clicked);
                                        }}
                                    />
                                )}
                                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
                            </React.Fragment>
                        );
                    })}
                </div>

                <StepContentWrapper
                    isCompleted={isCompleted}
                    currentStep={currentStep}
                    direction={direction}
                    className={`step-content-default ${contentClassName}`}
                >
                    {stepsArray[currentStep - 1]}
                </StepContentWrapper>

                {!isCompleted && (
                    <div className={`footer-container ${footerClassName}`}>
                        <div className={`footer-nav ${currentStep !== 1 ? 'spread' : 'end'}`}>
                            {currentStep !== 1 && (
                                <button
                                    onClick={handleBack}
                                    className={`back-button ${currentStep === 1 ? 'inactive' : ''}`}
                                    {...backButtonProps}
                                >
                                    {backButtonText}
                                </button>
                            )}
                            <button
                                onClick={isLastStep ? handleComplete : handleNext}
                                className="next-button shadow-glow hover:shadow-glow-hover transition-all duration-300"
                                {...nextButtonProps}
                            >
                                {isLastStep ? 'Finish' : nextButtonText}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

interface StepContentWrapperProps {
    isCompleted: boolean;
    currentStep: number;
    direction: number;
    children: ReactNode;
    className?: string;
}

function StepContentWrapper({ isCompleted, currentStep, direction, children, className }: StepContentWrapperProps) {
    const [parentHeight, setParentHeight] = useState(0);

    return (
        <motion.div
            className={className}
            style={{ position: 'relative', overflow: 'hidden' }}
            animate={{ height: isCompleted ? 0 : parentHeight }}
            transition={{ type: 'spring', duration: 0.4 }}
        >
            <AnimatePresence initial={false} mode="sync" custom={direction}>
                {!isCompleted && (
                    <SlideTransition Key={currentStep} direction={direction} onHeightReady={(h) => setParentHeight(h)}>
                        {children}
                    </SlideTransition>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

interface SlideTransitionProps {
    children: ReactNode;
    direction: number;
    onHeightReady: (height: number) => void;
    Key: number;
}

function SlideTransition({ children, direction, onHeightReady, Key }: SlideTransitionProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
    }, [children, onHeightReady]);

    return (
        <motion.div
            key={Key}
            ref={containerRef}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
        >
            {children}
        </motion.div>
    );
}

const stepVariants: Variants = {
    enter: (dir: number) => ({
        x: dir >= 0 ? '-100%' : '100%',
        opacity: 0
    }),
    center: {
        x: '0%',
        opacity: 1
    },
    exit: (dir: number) => ({
        x: dir >= 0 ? '50%' : '-50%',
        opacity: 0
    })
};

export function Step({ children }: { children: ReactNode }) {
    return <div className="step-default">{children}</div>;
}

interface StepIndicatorProps {
    step: number;
    currentStep: number;
    onClickStep: (step: number) => void;
    disableStepIndicators?: boolean;
}

function StepIndicator({ step, currentStep, onClickStep, disableStepIndicators }: StepIndicatorProps) {
    const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

    const handleClick = () => {
        if (step !== currentStep && !disableStepIndicators) onClickStep(step);
    };

    return (
        <motion.div onClick={handleClick} className="step-indicator" animate={status} initial={false}>
            <motion.div
                variants={{
                    inactive: { scale: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#a1a1aa', border: '1px solid rgba(255, 255, 255, 0.1)' },
                    active: { scale: 1.1, backgroundColor: 'var(--color-accent, #A855F7)', color: '#fff', border: '1px solid var(--color-accent, #A855F7)' },
                    complete: { scale: 1, backgroundColor: 'var(--color-accent, #A855F7)', color: '#fff', border: '1px solid var(--color-accent, #A855F7)' }
                }}
                transition={{ duration: 0.3 }}
                className="step-indicator-inner shadow-lg"
            >
                {status === 'complete' ? (
                    <CheckIcon className="check-icon" />
                ) : status === 'active' ? (
                    <div className="active-dot bg-white shadow-[0_0_10px_white]" />
                ) : (
                    <span className="step-number">{step}</span>
                )}
            </motion.div>
        </motion.div>
    );
}

function StepConnector({ isComplete }: { isComplete: boolean }) {
    const lineVariants = {
        incomplete: { width: 0, backgroundColor: 'transparent' },
        complete: { width: '100%', backgroundColor: 'var(--color-accent, #A855F7)' }
    };

    return (
        <div className="step-connector bg-white/5">
            <motion.div
                className="step-connector-inner shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                variants={lineVariants}
                initial={false}
                animate={isComplete ? 'complete' : 'incomplete'}
                transition={{ duration: 0.4 }}
            />
        </div>
    );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg {...props} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.1, type: 'tween', ease: 'easeOut', duration: 0.3 }}
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
            />
        </svg>
    );
}
