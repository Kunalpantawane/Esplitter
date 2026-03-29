 // qrpay.js — QR Scanner + UPI Payment Gateway
// Esplitter acts as a gateway: scan QR → enter amount/note → pay via UPI apps → track payment

const QRPay = (() => {
    let html5QrCode = null;
    let scannedData = null; // { upiId, name, amount, note }

    // ---- Parse UPI QR string ----
    function parseUPI(text) {
        // Format: upi://pay?pa=user@upi&pn=Name&am=100.00&tn=Note&cu=INR
        const result = { upiId: '', name: '', amount: '', note: '' };
        try {
            let raw = text.trim();
            // Some QR codes use uppercase UPI://
            if (raw.toLowerCase().startsWith('upi://pay')) {
                const url = new URL(raw.replace(/^upi:\/\//i, 'https://upi.placeholder/'));
                result.upiId = url.searchParams.get('pa') || '';
                result.name = url.searchParams.get('pn') || '';
                result.amount = url.searchParams.get('am') || '';
                result.note = url.searchParams.get('tn') || '';
            } else if (raw.includes('@')) {
                // Plain UPI ID pasted
                result.upiId = raw;
            }
        } catch (e) {
            console.warn('QRPay: Could not parse UPI string', e);
        }
        return result;
    }

    // ---- Build UPI deep link ----
    // NOTE: We manually build the URL instead of using URLSearchParams because
    // URLSearchParams and encodeURIComponent percent-encode the '@' character (to %40).
    // UPI apps (PhonePe, GPay, Paytm) expect the raw '@' in the 'pa' parameter
    // and will often fail or misparse the whole intent if it is encoded.
    function buildUPILink({ upiId, name, amount, note }) {
        let url = `upi://pay?pa=${upiId}`;
        if (name) url += `&pn=${encodeURIComponent(name)}`;
        if (amount) {
            // Some buggy UPI apps misread "1.00" as "100". Pass integers cleanly.
            const num = parseFloat(amount);
            const amStr = Number.isInteger(num) ? String(num) : num.toFixed(2);
            url += `&am=${amStr}`;
        }
        if (note) url += `&tn=${encodeURIComponent(note)}`;
        url += '&cu=INR';
        return url;
    }

    // HTML-escape a string for safe embedding in HTML attributes
    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    // ---- Start Scanner ----
    async function startScanner() {
        scannedData = null;
        const modal = document.getElementById('modal-qr-scanner');
        modal.classList.remove('hidden');

        const readerEl = document.getElementById('qr-reader');
        readerEl.innerHTML = '';
        document.getElementById('qr-status').textContent = 'Point camera at a UPI QR code…';
        document.getElementById('qr-status').className = 'qr-status scanning';

        try {
            html5QrCode = new Html5Qrcode('qr-reader');
            await html5QrCode.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                onScanSuccess,
                () => { } // ignore scan failures (continuous)
            );
        } catch (err) {
            console.error('QRPay: Camera error', err);
            const statusEl = document.getElementById('qr-status');
            statusEl.className = 'qr-status error';
            
            // Map specific error types
            if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
                statusEl.textContent = '❌ Camera permission denied. Please allow access or upload an image.';
            } else if (err.name === 'NotFoundError' || err.message?.includes('device not found')) {
                statusEl.textContent = '❌ No camera found on this device. You can upload an image instead.';
            } else if (err.name === 'NotReadableError' || err.message?.includes('already in use')) {
                statusEl.textContent = '❌ Camera is already in use by another application. Please upload an image.';
            } else {
                statusEl.textContent = '❌ Camera not available. Try uploading an image instead.';
            }
        }
    }

    // ---- File Upload Fallback ----
    async function handleFileUpload(event) {
        if (!event.target.files || event.target.files.length === 0) return;
        
        const file = event.target.files[0];
        const statusEl = document.getElementById('qr-status');
        
        statusEl.textContent = '⏳ Scanning image...';
        statusEl.className = 'qr-status scanning';

        try {
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode('qr-reader');
            }
            // scanFile(file, showImage)
            const decodedText = await html5QrCode.scanFile(file, true);
            await onScanSuccess(decodedText);
        } catch (err) {
            console.warn('QRPay: File scan failed', err);
            statusEl.textContent = '⚠️ Could not find a valid UPI QR code in the image. Try another.';
            statusEl.className = 'qr-status error';
        }
        
        // Reset input so the same file could be selected again if needed
        event.target.value = '';
    }

    // ---- Scan Success ----
    async function onScanSuccess(decodedText) {
        // Stop scanning immediately
        try { await html5QrCode.stop(); } catch (_) { }

        const parsed = parseUPI(decodedText);
        if (!parsed.upiId) {
            document.getElementById('qr-status').textContent =
                '⚠️ Not a valid UPI QR code. Try again.';
            document.getElementById('qr-status').className = 'qr-status error';
            // Restart scanner after 2 seconds
            setTimeout(() => startScanner(), 2000);
            return;
        }

        scannedData = parsed;

        // Close scanner → open payment form
        document.getElementById('modal-qr-scanner').classList.add('hidden');
        showPaymentForm(parsed);
    }

    // ---- Stop Scanner ----
    async function stopScanner() {
        try {
            if (html5QrCode) await html5QrCode.stop();
        } catch (_) { }
        document.getElementById('modal-qr-scanner').classList.add('hidden');
    }

    // ---- Show Payment Form ----
    function showPaymentForm(data) {
        // Keep the latest payment payload in module state so button rendering,
        // copy link, and record flows all use the same source of truth.
        scannedData = { ...data };

        document.getElementById('pay-upi-id').textContent = data.upiId;
        document.getElementById('pay-name').textContent = data.name || 'Unknown';

        const amtInput = document.getElementById('pay-amount');
        amtInput.value = data.amount || '';

        const noteInput = document.getElementById('pay-note');
        noteInput.value = data.note || '';

        // Check if desktop to show QR fallback instead of intent buttons
        const isDesktop = window.innerWidth > 768;
        if (isDesktop) {
            document.getElementById('pay-mobile-upi-section').classList.add('hidden');
            document.getElementById('pay-desktop-qr-container').classList.remove('hidden');
        } else {
            document.getElementById('pay-mobile-upi-section').classList.remove('hidden');
            document.getElementById('pay-desktop-qr-container').classList.add('hidden');
        }

        document.getElementById('modal-qr-payment').classList.remove('hidden');
        
        // Force render
        renderAppButtons();
    }

    // ---- Generate UPI app buttons with deep links ----
    function getPaymentLinks(upiId, amount, note, recipientName) {
        const link = buildUPILink({ upiId, name: recipientName, amount, note });

        // Different apps use the same upi:// scheme but some support intent:// on Android
        return [
            { name: 'Any UPI App', icon: '📱', url: link, cls: 'upi-generic' },
            { name: 'Google Pay', icon: '🟢', url: link, cls: 'upi-gpay' },
            { name: 'PhonePe', icon: '🟣', url: link, cls: 'upi-phonepe' },
            { name: 'Paytm', icon: '🔵', url: link, cls: 'upi-paytm' },
        ];
    }

    // ---- Open UPI App ----
    function openUPIApp(url) {
        // Custom URL schemes are best triggered via location on mobile browsers.
        // On desktop this usually fails, so we provide a quick fallback.
        if (!url) {
            UI.showToast('Invalid UPI link', 'warning');
            return;
        }

        try {
            window.location.href = url;
        } catch (_) {
            copyUPILink();
            UI.showToast('Could not open app. UPI link copied.', 'warning');
        }
    }

    // ---- Render UPI App Buttons & Desktop QR ----
    function renderAppButtons() {
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const note = document.getElementById('pay-note').value.trim();
        const upiId = scannedData?.upiId || '';
        const name = scannedData?.name || '';

        if (!upiId) return;

        const apps = getPaymentLinks(upiId, amount > 0 ? amount : '', note, name);
        
        // Render mobile buttons
        const container = document.getElementById('upi-app-grid');
        container.innerHTML = apps.map(app => `
            <button class="upi-app-btn ${app.cls}" data-url="${escapeAttr(app.url)}">
                <span class="upi-app-icon">${app.icon}</span>
                <span class="upi-app-name">${app.name}</span>
            </button>
        `).join('');

        // Render desktop QR
        if (window.innerWidth > 768 && typeof QRCode !== 'undefined') {
            const canvas = document.getElementById('pay-desktop-qr');
            const deepLink = buildUPILink({ upiId, name, amount, note });
            QRCode.toCanvas(canvas, deepLink, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            }, (error) => {
                if (error) console.error('QR Generate Error:', error);
            });
        }
    }

    // ---- Copy UPI Link ----
    function copyUPILink() {
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const note = document.getElementById('pay-note').value.trim();
        const upiId = scannedData?.upiId || '';
        const name = scannedData?.name || '';
        const link = buildUPILink({ upiId, name, amount, note });

        navigator.clipboard.writeText(link).then(() => {
            const btn = document.getElementById('btn-copy-upi');
            btn.textContent = '✅ Copied!';
            setTimeout(() => { btn.textContent = '📋 Copy UPI Link'; }, 2000);
        }).catch(() => {
            prompt('Copy this UPI link:', link);
        });
    }

    // ---- Record Payment ----
    async function recordPayment(groupId) {
        if (!scannedData) return;
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const note = document.getElementById('pay-note').value.trim() || 'QR Payment';

        if (amount <= 0) {
            UI.showToast('Please enter a valid amount', 'warning');
            return;
        }

        try {
            const session = await Auth.getSession();
            
            // Check if this is a group settlement context with an existing transaction
            if (scannedData.settleContext && scannedData.settleContext.clientId && typeof Sync !== 'undefined') {
                await Sync.updateSettlementStatus(
                    scannedData.settleContext.clientId, 
                    scannedData.settleContext.serverId, 
                    'PAID'
                );
            } else if (scannedData.settleContext && typeof Sync !== 'undefined') {
                // Fallback for ad-hoc settlement creation without pending request
                await Sync.addExpense({
                    groupId: scannedData.settleContext.groupId,
                    description: `💸 Settlement to ${scannedData.name || scannedData.upiId}`,
                    amount: amount,
                    paidBy: session.user.id,
                    splits: [{ userId: scannedData.settleContext.toUserId, amount: amount }],
                    type: 'PAYMENT',
                    status: 'PAID'
                });
            } else if (groupId && typeof Sync !== 'undefined') {
                // Ad-hoc PAYMENT string if just a loose QR scan in a group view
                await Sync.addExpense({
                    groupId: groupId,
                    description: `💸 QR Pay to ${scannedData.name || scannedData.upiId} – ${note}`,
                    amount: amount,
                    paidBy: session.user.id,
                    splits: [{ userId: session.user.id, amount: amount }],
                    type: 'PAYMENT',
                    status: 'PAID'
                });
            }
        } catch (e) {
            console.error('QRPay: Could not record payment', e);
            UI.showToast('Failed to record payment: ' + e.message, 'error');
        }
        
        document.getElementById('modal-qr-payment').classList.add('hidden');
    }

    // Public API
    return {
        startScanner,
        stopScanner,
        showPaymentForm,
        renderAppButtons,
        openUPIApp,
        copyUPILink,
        recordPayment,
        parseUPI,
        buildUPILink,
        handleFileUpload,
    };
})();

window.QRPay = QRPay;
