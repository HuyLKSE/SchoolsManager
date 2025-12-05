/**
 * Middleware to ensure user has completed placement test
 * Redirects to /english/placement if not completed
 * Used for protected English learning pages (dashboard, practice, etc.)
 */
export const ensurePlacementComplete = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.redirect('/login?returnTo=/english/dashboard');
    }

    // Check if English is enabled
    if (!user.englishProfile || !user.englishProfile.enabled) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html><head><title>Access Denied</title>
        <link rel="stylesheet" href="/css/style.css"></head>
        <body class="bg-gray-50 flex items-center justify-center min-h-screen">
          <div class="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
            <h1 class="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p class="text-gray-600 mb-6">English Learning module is not enabled for your account. Please contact your teacher.</p>
            <a href="/dashboard" class="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Back to Dashboard</a>
          </div>
        </body></html>
      `);
    }

    // DEV BYPASS: Allow bypass in development with query param
    if (process.env.NODE_ENV === 'development' && req.query.bypass === 'true') {
      console.log('[DEV] Bypassing placement test check');
      return next();
    }

    // Check if placement test is done
    const initialTestDone = user.englishProfile.initialTestDone || false;

    console.log(`[ensurePlacementComplete] User ${user._id}: initialTestDone = ${initialTestDone}`);

    if (!initialTestDone) {
      // First time accessing English Learn → redirect to placement
      console.log(`[ensurePlacementComplete] Redirecting to /english/placement`);
      return res.redirect('/english/placement');
    }

    // Placement test completed → proceed
    next();
  } catch (error) {
    console.error('Error in ensurePlacementComplete middleware:', error);
    next(error);
  }
};

/**
 * Middleware to ensure user has NOT completed placement test
 * Redirects to dashboard if already completed
 * Used for placement test page to prevent retaking
 */
export const ensurePlacementNotComplete = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.redirect('/login?returnTo=/english/placement');
    }

    const initialTestDone = user.englishProfile?.initialTestDone || false;
    
    // Allow retake with query parameter ?retake=true
    const allowRetake = req.query.retake === 'true';

    if (initialTestDone && !allowRetake) {
      // Already completed placement test → redirect to dashboard
      console.log(`[ensurePlacementNotComplete] User ${user._id} already completed test, redirecting to dashboard`);
      return res.redirect('/english/dashboard?message=already_completed');
    }

    // Not completed OR retake allowed → proceed to placement test
    if (allowRetake) {
      console.log(`[ensurePlacementNotComplete] User ${user._id} retaking placement test`);
    }
    next();
  } catch (error) {
    console.error('Error in ensurePlacementNotComplete middleware:', error);
    next(error);
  }
};
