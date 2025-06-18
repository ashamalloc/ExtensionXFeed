import CryptoJS from 'crypto-js';

export const encryptToken = (token, key) => 
  CryptoJS.AES.encrypt(token, key).toString();

export const decryptToken = (ciphertext, key) => 
  CryptoJS.AES.decrypt(ciphertext, key).toString(CryptoJS.enc.Utf8);