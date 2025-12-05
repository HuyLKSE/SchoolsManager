import mongoose from 'mongoose';

/**
 * Wrapper function để thực thi MongoDB transaction
 * @param {Function} callback - Async function nhận session parameter
 * @returns {Promise<any>} - Kết quả từ callback
 */
export const withTransaction = async (callback) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Retry logic cho transaction (xử lý transient errors)
 * @param {Function} callback - Transaction callback
 * @param {number} maxRetries - Số lần retry tối đa
 * @returns {Promise<any>}
 */
export const withTransactionRetry = async (callback, maxRetries = 3) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await withTransaction(callback);
    } catch (error) {
      lastError = error;

      // Retry nếu là transient error (write conflict, network issue)
      if (
        error.hasErrorLabel &&
        (error.hasErrorLabel('TransientTransactionError') ||
          error.hasErrorLabel('UnknownTransactionCommitResult'))
      ) {
        console.warn(`Transaction retry ${i + 1}/${maxRetries}:`, error.message);
        continue;
      }

      // Không retry nếu là validation error hoặc business logic error
      throw error;
    }
  }

  throw lastError;
};
