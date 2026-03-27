import React from 'react';

function Monitor(props) {
    const {message, imageUrl} = props;

    return (
        <div id='monitor'>
            {imageUrl === 'logo' && <img src={require('../resources/background_image.png')} alt=""></img>}
            {imageUrl && imageUrl !== 'logo' && <img src={imageUrl} alt=""></img>}  
            <div>
                <div>{message.line1}</div>
                <div>{message.line2}</div>      
            </div>                           
        </div>
    );
}

export default Monitor;