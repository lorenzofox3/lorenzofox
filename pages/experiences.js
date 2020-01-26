import React from 'react';
import Head from '../components/head';
import Nav from '../components/nav';

const Experiences = () => {
    return (
        <div>
            <Head title="Experiences"/>
            <header>
                <Nav/>
                <h1>Experiences</h1>
            </header>
            <main>
                <article>
                    <header>
                        <h2>Full stack software engineer at <a href="">Citykleta</a></h2>
                        <p>Cuba. From <time dateTime="">December 2018</time> to <time dateTime>December 2019</time></p>
                    </header>
                    <p>
                        Collaborating with an active member of the cyclist community of the city of La Habana. I worked
                        on a proof of concept (to help fund raising) of a platform for the cyclists.
                    </p>

                    <ul>
                        <li>automated data pipe from Open Street Map to local instance of a PostgreSQL & PostGIS
                            database
                        </li>
                        <li>text search engine in Spanish for points of interests. Free third party services return poor
                            result for the Caribbean area.
                        </li>
                        <li>reverse geo coding.</li>
                        <li>address lookup engine. Any third party would not understand La Habana addresses schema and
                            would return very poor result. PostGIS was heavily used here
                        </li>
                        <li>Itinerary calculation for bicycle. Mapbox has been used</li>
                        <li>A web application based on an interactive map had been developed using emerging web
                            components components
                        </li>
                    </ul>
                    <p>
                        Due to budget constraints, a serverless approach has been used using the <a
                        href="https://zeit.co/docs">now</a> platform
                    </p>
                </article>
                <article>
                    <header>
                        <h2>Open Source Developer</h2>
                        <p>Cuba. From <time dateTime="">June 2016</time> to <time dateTime>December 2018</time></p>
                    </header>
                    <p>Under very specific conditions, living in Cuba. I spent some time on research and development and
                        open source projects in various fields</p>
                    <ul>
                        <li>OAuth server</li>
                        <li>Accessible UI components (A11y)</li>
                        <li>Implementing the grammar of graphics for the web (data visualization and charts)</li>
                        <li>A javascript parser... in Javascript (compatible ES5 and 80% ES2018)</li>
                        <li>A whole UI framework based on virtual dom implementation (It had sort of hooks long
                            before React !)
                        </li>
                        <li>A query builder for PostgreSQL with Nodejs</li>
                        <li>Grid libraries for the browser</li>
                        <li>Testing tools for Javascript (nodejs and browser)</li>
                        <li>Utilities libraries for Nodejs and the browser</li>
                    </ul>

                    <p>See my <a href="https://github.com/lorenzofox3">github account</a> for more details.</p>
                </article>
            </main>
        </div>
    );
};

export default Experiences;