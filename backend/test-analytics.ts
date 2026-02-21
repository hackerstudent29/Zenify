import axios from 'axios';

async function test() {
    try {
        const loginRes = await axios.post('http://127.0.0.1:3000/api/auth/login', {
            email: "ramzendrum@gmail.com",
            password: "RAMA2007@"
        });

        const token = loginRes.data.accessToken;
        const cookie = loginRes.headers['set-cookie']?.join("; ");

        try {
            const res = await axios.get('http://127.0.0.1:3000/api/analytics', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Cookie: cookie
                }
            });
            console.log("Success:", res.data);
        } catch (e: any) {
            console.error("Analytics Error STATUS:", e.response?.status);
            console.error("Analytics Error DATA:", e.response?.data);
        }
    } catch (e: any) {
        console.error("Login failed", e.message);
    }
}
test();
