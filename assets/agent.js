// Based on https://github.com/nowsecure/frida-uikit

const {
  CADisplayLink,
  NSAutoreleasePool,
  NSRunLoop,
  NSThread,
  UIApplication,
  UITouch,
  UIWindow,
} = ObjC.classes

let Injector = null
let window = null
let activeInjector = null
let expiryTimer = null

rpc.exports = {
  down(x, y) {
    return performOnMainThread(() => {
      if (activeInjector !== null) {
        return
      }

      if (window === null) {
        window = ObjC.chooseSync(ObjC.classes.UIWindow)[0]
        window.makeKeyWindow()
      }

      const point = window.convertPoint_toView_([x, y], NULL)

      const injector = Injector.alloc().init()
      const priv = ObjC.getBoundData(injector)
      priv.window = window
      priv.pending.push(point)
      priv.onComplete = function () {
        Script.unpin()
        activeInjector.release()
        activeInjector = null
      }

      activeInjector = injector
      Script.pin()
      scheduleExpiry()
    })
  },
  up() {
    return performOnMainThread(() => {
      if (activeInjector === null) {
        return
      }

      ObjC.getBoundData(activeInjector).pending.push(null)
      cancelExpiry()
    })
  },
}

recv('move', onMove)
function onMove({ x, y }) {
  performOnMainThread(() => {
    if (activeInjector === null) {
      return
    }

    const point = window.convertPoint_toView_([x, y], NULL)
    ObjC.getBoundData(activeInjector).pending.push(point)
    scheduleExpiry()
  })

  recv('move', onMove)
}

function scheduleExpiry(pending) {
  cancelExpiry()
  expiryTimer = setTimeout(() => {
    expiryTimer = null
    ObjC.getBoundData(activeInjector).pending.push(null)
  }, 5000)
}

function cancelExpiry() {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer)
    expiryTimer = null
  }
}

const UITouchPhaseBegan = 0
const UITouchPhaseMoved = 1
const UITouchPhaseStationary = 2
const UITouchPhaseEnded = 3
const UITouchPhaseCancelled = 4

const UITOUCH_FLAG_IS_FIRST_TOUCH_FOR_VIEW = 1
const UITOUCH_FLAG_IS_TAP = 2

const CGFloat = (Process.pointerSize === 4) ? 'float' : 'double'
const CGPoint = [CGFloat, CGFloat]
const CGPointEqualToPoint = new NativeFunction(
  Module.getExportByName('CoreGraphics', 'CGPointEqualToPoint'),
  'uint8',
  [CGPoint, CGPoint])
const CGPointZero = Module.getExportByName('CoreGraphics', 'CGPointZero').readPointer()
const CGSize = [CGFloat, CGFloat]

const kIOHIDDigitizerEventRange = 0x00000001
const kIOHIDDigitizerEventTouch = 0x00000002
const kIOHIDDigitizerEventPosition = 0x00000004
const IOHIDEventCreateDigitizerFingerEvent = new NativeFunction(
  Module.getExportByName(null, 'IOHIDEventCreateDigitizerFingerEvent'),
  'pointer',
  [
    'pointer',            // allocator
    ['uint32', 'uint32'], // timestamp
    'uint32',             // index
    'uint32',             // identity
    'uint32',             // eventMask
    CGFloat,              // x
    CGFloat,              // y
    CGFloat,              // z
    CGFloat,              // tipPressure
    CGFloat,              // twist
    'uint8',              // range
    'uint8',              // touch
    'uint32'              // options
  ])

const kCFAllocatorDefault = Module.getExportByName('CoreFoundation', 'kCFAllocatorDefault').readPointer()
const NSRunLoopCommonModes = Module.getExportByName('Foundation', 'NSRunLoopCommonModes').readPointer()
const CFGetSystemUptime = new NativeFunction(
  Module.getExportByName('CoreFoundation', 'CFGetSystemUptime'),
  'double',
  [])
const CFRelease = new NativeFunction(
  Module.getExportByName('CoreFoundation', 'CFRelease'),
  'void',
  ['pointer'])

const mach_absolute_time = new NativeFunction(
  Module.getExportByName('libSystem.B.dylib', 'mach_absolute_time'),
  'uint64',
  [])

Injector = ObjC.registerClass({
  methods: {
    '- init': function () {
      const self = this.super.init()
      if (self !== null) {
        const displayLink = CADisplayLink.displayLinkWithTarget_selector_(self, ObjC.selector('dispatchTouch:'))
        ObjC.bind(self, {
          displayLink: displayLink,
          window: null,
          touch: null,
          pending: [],
          previous: null,
          onComplete: function () { }
        })
        displayLink.addToRunLoop_forMode_(NSRunLoop.mainRunLoop(), NSRunLoopCommonModes)
        displayLink.setPaused_(false)
      }
      return self
    },
    '- dealloc': function () {
      ObjC.unbind(this.self)
      this.super.dealloc()
    },
    '- dispatchTouch:': {
      retType: 'void',
      argTypes: ['object'],
      implementation: function (sender) {
        const priv = this.data
        const { pending } = priv

        if (pending[pending.length - 1] === null && priv.touch === null) {
          priv.displayLink.invalidate()
          priv.displayLink = null

          priv.onComplete()
          return
        }

        let point = pending[0]
        if (pending.length > 1) {
          pending.shift()
        }
        const isLastTouch = point === null

        let touch, phase
        if (priv.touch === null) {
          touch = UITouch.alloc().init()
          priv.touch = touch
          touch.setTapCount_(1)
          setIsTap(touch, true)
          phase = UITouchPhaseBegan
          touch.setPhase_(phase)
          touch.setWindow_(priv.window)
          touch['- _setLocationInWindow:resetPrevious:'].call(touch, point, true)
          touch.setView_(priv.window.hitTest_withEvent_(point, NULL))
          setIsFirstTouchForView(touch, true)
        } else {
          touch = priv.touch

          if (isLastTouch) {
            touch['- _setLocationInWindow:resetPrevious:'].call(touch, priv.previous, false)
            phase = UITouchPhaseEnded
            point = priv.previous
          } else {
            touch['- _setLocationInWindow:resetPrevious:'].call(touch, point, false)
            phase = CGPointEqualToPoint(point, priv.previous) ? UITouchPhaseStationary : UITouchPhaseMoved
          }

          touch.setPhase_(phase)
        }

        const app = UIApplication.sharedApplication()
        const event = app['- _touchesEvent'].call(app)
        event['- _clearTouches'].call(event)

        const absoluteTime = mach_absolute_time()

        const timestamp = [
          absoluteTime.shr(32).toNumber(),
          absoluteTime.and(0xffffffff).toNumber()
        ]

        touch.setTimestamp_(CFGetSystemUptime())

        const eventMask = (phase === UITouchPhaseMoved)
          ? kIOHIDDigitizerEventPosition
          : (kIOHIDDigitizerEventRange | kIOHIDDigitizerEventTouch)
        const isRangeAndTouch = (phase !== UITouchPhaseEnded) ? 1 : 0

        const hidEvent = IOHIDEventCreateDigitizerFingerEvent(
          kCFAllocatorDefault,
          timestamp,
          0,
          2,
          eventMask,
          point[0],
          point[1],
          0,
          0,
          0,
          isRangeAndTouch,
          isRangeAndTouch,
          0)

        if ('- _setHidEvent:' in touch) {
          touch['- _setHidEvent:'].call(touch, hidEvent)
        }

        event['- _setHIDEvent:'].call(event, hidEvent)
        event['- _addTouch:forDelayedDelivery:'].call(event, touch, false)

        const pool = NSAutoreleasePool.alloc().init()
        try {
          app.sendEvent_(event)
        } finally {
          pool.release()

          CFRelease(hidEvent)

          priv.previous = point
          if (isLastTouch) {
            touch.release()
            priv.touch = null
          }
        }
      }
    }
  }
})

function setIsTap(touch, isTap) {
  const flags = touch.$ivars['_touchFlags']
  const newFlags = [...flags]
  if (isTap) {
    newFlags[0] |= UITOUCH_FLAG_IS_TAP
  } else {
    newFlags[0] &= ~UITOUCH_FLAG_IS_TAP
  }
  touch.$ivars['_touchFlags'] = newFlags
}

function setIsFirstTouchForView(touch, isFirst) {
  const flags = touch.$ivars['_touchFlags']
  const newFlags = [...flags]
  if (isFirst) {
    newFlags[0] |= UITOUCH_FLAG_IS_FIRST_TOUCH_FOR_VIEW
  } else {
    newFlags[0] &= ~UITOUCH_FLAG_IS_FIRST_TOUCH_FOR_VIEW
  }
  touch.$ivars['_touchFlags'] = newFlags
}

function performOnMainThread(action) {
  return new Promise(function (resolve, reject) {
    if (NSThread.isMainThread()) {
      performAction()
    } else {
      ObjC.schedule(ObjC.mainQueue, performAction)
    }

    function performAction() {
      try {
        const result = action()
        resolve(result)
      } catch (e) {
        reject(e)
      }
    }
  })
}
