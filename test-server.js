async function testRegisterCall() {
    const fetch = (await import('node-fetch')).default;
    const url = 'http://localhost:8080/register-call-on-your-server';
    const agentId = ''; // Use a valid agent ID for your test

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agentId: agentId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Test successful:', data);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testRegisterCall();
