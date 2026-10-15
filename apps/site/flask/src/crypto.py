from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import serialization
import os

# 1. Generate ECC key pairs
def generate_ecc_key():
    return ec.generate_private_key(ec.SECP256R1())

# 2. Export public key to raw format
def export_public_key(public_key):
    return public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )

# 3. Import public key from raw format
def import_public_key(public_key_bytes):
    return ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(),
        public_key_bytes
    )

# 4. Compute shared secret using ECDH
def compute_shared_secret(private_key, peer_public_key):
    shared_secret = private_key.exchange(ec.ECDH(), peer_public_key)
    
    # Derive a symmetric key using HKDF
    derived_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b'ecdh key agreement',
    ).derive(shared_secret)
    
    return derived_key

# 5. AES-GCM Encryption
def encrypt_message(key, plaintext):
    iv = os.urandom(12)  # Generate a random IV
    cipher = Cipher(algorithms.AES(key[:32]), modes.GCM(iv))
    encryptor = cipher.encryptor()
    
    ciphertext = encryptor.update(plaintext.encode()) + encryptor.finalize()
    return iv, encryptor.tag, ciphertext  # Return IV, tag, and encrypted message

# 6. AES-GCM Decryption
def decrypt_message(key, iv, tag, ciphertext):
    cipher = Cipher(algorithms.AES(key[:32]), modes.GCM(iv, tag))
    decryptor = cipher.decryptor()
    
    return decryptor.update(ciphertext) + decryptor.finalize()


def decrypt_message_for_session(session, data):
    """Decrypt a browser prompt with this socket session's negotiated key."""
    key = session.get("shared_key") if session else None
    if key is None:
        raise ValueError("Key exchange is not complete")

    iv = bytes.fromhex(data["iv"])
    ciphertext = bytes.fromhex(data["ciphertext"])
    tag = bytes.fromhex(data["tag"])
    return decrypt_message(key, iv, tag, ciphertext)

# Simulate communication between Alice and Bob
def main():
    # Generate key pairs for Alice and Bob
    alice_private = generate_ecc_key()
    bob_private = generate_ecc_key()
    
    # Exchange public keys over an insecure channel
    alice_public = alice_private.public_key()
    bob_public = bob_private.public_key()

    # Compute shared secret
    alice_shared_key = compute_shared_secret(alice_private, bob_public)
    bob_shared_key = compute_shared_secret(bob_private, alice_public)

    print("Shared key matches:", alice_shared_key == bob_shared_key)

    # Alice encrypts a message
    message = "Hello, Bob! Securely sent via ECDH."
    iv, tag, ciphertext = encrypt_message(alice_shared_key, message)

    print("\nCiphertext:", ciphertext.hex())

    # Bob decrypts the message
    decrypted_message = decrypt_message(bob_shared_key, iv, tag, ciphertext)
    print("\nDecrypted message:", decrypted_message.decode())

if __name__ == "__main__":
    main()
