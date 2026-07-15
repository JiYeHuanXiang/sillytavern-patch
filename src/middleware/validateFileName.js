import path from 'node:path';

/**
 * Validates that a user-supplied path, when resolved against a base directory,
 * does not escape that directory (blocks path traversal attacks like "../").
 * @param {string} baseDir - The safe base directory
 * @param {string} userPath - The user-supplied relative path
 * @returns {boolean} True if the resolved path is within baseDir
 */
export function isPathSafe(baseDir, userPath) {
    if (!userPath || typeof userPath !== 'string') return false;
    const resolved = path.resolve(baseDir, userPath);
    return resolved.startsWith(path.resolve(baseDir));
}

export const forbiddenRegExp = /\x00/;

/**
 * Checks if an object has a toString method.
 * @param {object} o Object to check
 * @returns {boolean} True if the object has a toString method, false otherwise
 */
function hasToString(o) {
    return o != null && typeof o.toString === 'function';
}

/**
 * Gets a middleware function that validates the field in the request body.
 * @param {string} fieldName Field name
 * @returns {import('express').RequestHandler} Middleware function
 */
export function getFileNameValidationFunction(fieldName) {
    /**
    * Validates the field in the request body.
    * @param {import('express').Request} req Request object
    * @param {import('express').Response} res Response object
    * @param {import('express').NextFunction} next Next middleware
    */
    return function validateAvatarUrlMiddleware(req, res, next) {
        if (req.body && fieldName in req.body && (typeof req.body[fieldName] === 'string' || hasToString(req.body[fieldName]))) {
            const value = req.body[fieldName];
            if (forbiddenRegExp.test(value)) {
                console.error('An error occurred while validating the request body', {
                    handle: req.user.profile.handle,
                    path: req.originalUrl,
                    field: fieldName,
                    value: value,
                });
                return res.sendStatus(400);
            }

            // Check for path traversal when user directories are available
            const charDir = req.user?.directories?.characters;
            if (charDir && !isPathSafe(charDir, value)) {
                console.error('Path traversal prevented in request body', {
                    handle: req.user.profile.handle,
                    path: req.originalUrl,
                    field: fieldName,
                    value: value,
                });
                return res.sendStatus(403);
            }
        }

        next();
    };
}

const avatarUrlValidationFunction = getFileNameValidationFunction('avatar_url');
export default avatarUrlValidationFunction;
