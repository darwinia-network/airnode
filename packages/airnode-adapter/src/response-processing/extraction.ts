import { BigNumber } from 'bignumber.js';
import isUndefined from 'lodash/isUndefined';
import * as casting from './casting';
import * as encoding from './encoding';
import { isNumericType } from './type-parser';
import { ReservedParameters } from '../types';

export function getRawValue(data: any, path?: string, defaultValue?: any) {
  // Some APIs return a simple value not in an object or array, like
  // a string, number or boolean. If this is the case, the user can
  // choose to omit the path which means that the adapter does not
  // need to do any "extraction".
  if (!path) {
    return data;
  }

  // We could use lodash#get, but it's slow and we want to control the
  // exact behaviour ourselves.
  return path.split('.').reduce((acc, segment) => {
    // eslint-disable-next-line functional/no-try-statement
    try {
      const nextValue = acc[segment];
      return nextValue === undefined ? defaultValue : nextValue;
    } catch (e) {
      return defaultValue;
    }
  }, data);
}

export function extractValue(data: unknown, path?: string) {
  const rawValue = getRawValue(data, path);

  if (isUndefined(rawValue)) {
    throw new Error(`Unable to find value from path: '${path}'`);
  }

  return rawValue;
}

// This function can throw an error in both extraction and encoding
// TODO: Should we suffix it with "orThrow" to make this explicit?
export function extractAndEncodeResponse(data: unknown, parameters: ReservedParameters) {
  const rawValue = extractValue(data, parameters._path);
  const value = casting.castValue(rawValue, parameters._type);

  if (isNumericType(parameters._type) && value instanceof BigNumber) {
    const multipledValue = casting.multiplyValue(value, parameters._times);
    const encodedValue = encoding.encodeValue(multipledValue.toString(), parameters._type);
    return { value: multipledValue, encodedValue };
  }

  const encodedValue = encoding.encodeValue(value, parameters._type);
  return { value, encodedValue };
}
