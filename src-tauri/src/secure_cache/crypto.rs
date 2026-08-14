use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use keyring::{Entry, Error as KeyringError};
use sha2::Sha256;
use zeroize::Zeroizing;

const KEYRING_SERVICE: &str = "education.millennium.desktop";
const KEYRING_ACCOUNT: &str = "secure-cache-master-key-v1";
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;

type HmacSha256 = Hmac<Sha256>;

pub struct CacheCrypto {
    key: Zeroizing<[u8; KEY_BYTES]>,
}

impl CacheCrypto {
    pub fn load_or_create(has_existing_ciphertext: bool) -> Result<Self, String> {
        let entry = keyring_entry()?;
        let encoded = match entry.get_password() {
            Ok(value) => value,
            Err(KeyringError::NoEntry) if has_existing_ciphertext => {
                return Err("CACHE_KEY_MISSING: encrypted local data exists but its credential-store key is unavailable".to_owned());
            }
            Err(KeyringError::NoEntry) => {
                let mut generated = [0_u8; KEY_BYTES];
                getrandom::fill(&mut generated)
                    .map_err(|error| format!("failed to generate cache key: {error}"))?;
                let encoded = URL_SAFE_NO_PAD.encode(generated);
                entry
                    .set_password(&encoded)
                    .map_err(|error| format!("failed to save cache key: {error}"))?;
                generated.fill(0);
                encoded
            }
            Err(error) => return Err(format!("failed to read cache key: {error}")),
        };

        let decoded = Zeroizing::new(
            URL_SAFE_NO_PAD
                .decode(encoded)
                .map_err(|_| "stored cache key is invalid".to_owned())?,
        );
        if decoded.len() != KEY_BYTES {
            return Err("stored cache key has an invalid length".to_owned());
        }
        let mut key = [0_u8; KEY_BYTES];
        key.copy_from_slice(decoded.as_slice());
        Ok(Self {
            key: Zeroizing::new(key),
        })
    }

    pub fn rotate() -> Result<Self, String> {
        let entry = keyring_entry()?;
        let mut generated = Zeroizing::new([0_u8; KEY_BYTES]);
        getrandom::fill(generated.as_mut())
            .map_err(|error| format!("failed to generate replacement cache key: {error}"))?;
        let encoded = URL_SAFE_NO_PAD.encode(generated.as_ref());
        entry
            .set_password(&encoded)
            .map_err(|error| format!("failed to save replacement cache key: {error}"))?;
        Ok(Self { key: generated })
    }

    pub fn owner_scope(&self, owner_id: &str) -> Result<String, String> {
        let mut mac = <HmacSha256 as Mac>::new_from_slice(self.key.as_ref())
            .map_err(|_| "failed to initialize owner scope".to_owned())?;
        mac.update(b"millennium-owner-scope-v1\0");
        mac.update(owner_id.as_bytes());
        Ok(to_hex(mac.finalize().into_bytes().as_slice()))
    }

    pub fn device_scope(&self) -> Result<String, String> {
        self.owner_scope("__device__")
    }

    pub fn encrypt(
        &self,
        owner_scope: &str,
        record_kind: &str,
        schema_version: u32,
        plaintext: &[u8],
    ) -> Result<([u8; NONCE_BYTES], Vec<u8>), String> {
        let cipher = Aes256Gcm::new_from_slice(self.key.as_ref())
            .map_err(|_| "failed to initialize cache encryption".to_owned())?;
        let mut nonce = [0_u8; NONCE_BYTES];
        getrandom::fill(&mut nonce)
            .map_err(|error| format!("failed to generate cache nonce: {error}"))?;
        let aad = associated_data(owner_scope, record_kind, schema_version);
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: plaintext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| "failed to encrypt local cache".to_owned())?;
        Ok((nonce, ciphertext))
    }

    pub fn decrypt(
        &self,
        owner_scope: &str,
        record_kind: &str,
        schema_version: u32,
        nonce: &[u8],
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, String> {
        if nonce.len() != NONCE_BYTES {
            return Err("encrypted cache nonce has an invalid length".to_owned());
        }
        let cipher = Aes256Gcm::new_from_slice(self.key.as_ref())
            .map_err(|_| "failed to initialize cache decryption".to_owned())?;
        let aad = associated_data(owner_scope, record_kind, schema_version);
        cipher
            .decrypt(
                Nonce::from_slice(nonce),
                Payload {
                    msg: ciphertext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| "local cache could not be decrypted".to_owned())
    }
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("secure credential store is unavailable: {error}"))
}

fn associated_data(owner_scope: &str, record_kind: &str, schema_version: u32) -> String {
    format!("education.millennium.desktop|cache-v1|{owner_scope}|{record_kind}|{schema_version}")
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}
