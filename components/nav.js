import React from 'react';
import Link from 'next/link';

const Nav = () => (
    <nav>
        <ul>
            <li>
                <Link href="/">
                    <a>Home</a>
                </Link>
            </li>
            <li>
                <Link href="/education">
                    <a>Education</a>
                </Link>
            </li>
            <li>
                <Link href="/experiences">
                    <a>Experiences</a>
                </Link>
            </li>
        </ul>
    </nav>
);

export default Nav;
